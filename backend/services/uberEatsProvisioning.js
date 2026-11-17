import jwt from "jsonwebtoken";
import StoreSettings from "../models/StoreSettings.js";
import { getUberEatsConfig } from "./uberEats.js";

// Vinculación de la tienda con la app (Uber Eats Marketplace, "POS
// provisioning"). Sin este paso Uber no manda los pedidos de la tienda al
// webhook aunque la app esté aprobada:
//   1. El dueño autoriza la app en Uber (OAuth authorization_code con el
//      permiso eats.pos_provisioning).
//   2. Con ese permiso se listan sus tiendas (GET /v1/eats/stores).
//   3. Se activa la integración en la tienda elegida
//      (POST /v1/eats/stores/{store_id}/pos_data) con la app como la que
//      maneja los pedidos.
// https://developer.uber.com/docs/eats/guides/pos-provision

export const UBER_PROVISIONING_SCOPE = "eats.pos_provisioning";
// Identificador de la sucursal en nuestro sistema (mismo que usa el portal).
export const POKE_PALACE_STORE_ID = "tij-centro-01";
const STATE_TTL = "15m";

const clip = (value, max) => String(value ?? "").trim().slice(0, max);

export class UberProvisioningError extends Error {
  constructor(message, code = "UBER_PROVISIONING_ERROR", status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function requireCredentials(config = getUberEatsConfig()) {
  if (!config.clientId || !config.clientSecret) {
    throw new UberProvisioningError(
      "Faltan UBER_EATS_CLIENT_ID o UBER_EATS_CLIENT_SECRET en el servidor",
      "UBER_NOT_CONFIGURED",
      503
    );
  }
  return config;
}

// El "state" viaja a Uber y regresa en el callback. Va firmado para que nadie
// pueda iniciar una vinculación sin haber pasado por el portal como dueño.
export function createOAuthState(staff, secret = process.env.JWT_SECRET) {
  return jwt.sign(
    { type: "uber_eats_provisioning", staffId: String(staff?.id || ""), staffName: clip(staff?.name, 80) },
    secret,
    { expiresIn: STATE_TTL }
  );
}

export function readOAuthState(state, secret = process.env.JWT_SECRET) {
  try {
    const decoded = jwt.verify(String(state || ""), secret);
    if (decoded?.type !== "uber_eats_provisioning") return null;
    return decoded;
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(state, config = requireCredentials()) {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", UBER_PROVISIONING_SCOPE);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeAuthorizationCode(code, config = requireCredentials()) {
  const form = new FormData();
  form.set("client_id", config.clientId);
  form.set("client_secret", config.clientSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", config.redirectUri);
  form.set("code", String(code || ""));

  const response = await fetch(config.tokenUrl, { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new UberProvisioningError(
      `Uber no aceptó la autorización (${response.status}): ${clip(data.error_description || data.error || "sin token", 200)}`
    );
  }
  const expiresIn = Math.max(60, Number(data.expires_in) || 3600);
  return { accessToken: data.access_token, expiresAt: new Date(Date.now() + expiresIn * 1000) };
}

async function userRequest(path, token, { method = "GET", body = null, config = getUberEatsConfig() } = {}) {
  const response = await fetch(`${config.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new UberProvisioningError(
      `Uber ${method} ${path} respondió ${response.status}: ${clip(text, 300)}`,
      response.status === 401 ? "UBER_TOKEN_EXPIRED" : "UBER_PROVISIONING_ERROR"
    );
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

export function normalizeUberStores(payload) {
  const stores = Array.isArray(payload?.stores) ? payload.stores : [];
  return stores
    .map((store) => {
      const location = store?.location || {};
      const address = [
        location.address || location.street_address || location.address_1,
        location.city,
      ].map((part) => clip(part, 120)).filter(Boolean).join(", ");
      return {
        storeId: clip(store?.store_id || store?.id, 128),
        name: clip(store?.name || store?.title || "Tienda sin nombre", 120),
        address,
      };
    })
    .filter((store) => store.storeId);
}

export async function listUberStores(token) {
  return normalizeUberStores(await userRequest("/v1/eats/stores", token));
}

export function activateUberStore(token, storeId) {
  return userRequest(`/v1/eats/stores/${encodeURIComponent(storeId)}/pos_data`, token, {
    method: "POST",
    body: {
      // Esta app recibe, acepta y cancela los pedidos de la tienda.
      is_order_manager: true,
      integrator_store_id: POKE_PALACE_STORE_ID,
    },
  });
}

// Callback de Uber: cambia el código por el permiso del dueño, lista sus
// tiendas y las guarda para que el dueño elija cuál activar.
export async function completeUberAuthorization({ code, state }) {
  const decoded = readOAuthState(state);
  if (!decoded) {
    throw new UberProvisioningError("El enlace de autorización venció o no es válido. Vuelve a tocar «Conectar con Uber».", "UBER_BAD_STATE", 400);
  }
  if (!code) throw new UberProvisioningError("Uber no regresó el código de autorización", "UBER_NO_CODE", 400);

  const { accessToken, expiresAt } = await exchangeAuthorizationCode(code);
  const stores = await listUberStores(accessToken);
  await StoreSettings.findOneAndUpdate(
    { key: "main" },
    {
      $set: {
        "uberEats.connectedAt": new Date(),
        "uberEats.connectedBy": decoded.staffName || null,
        "uberEats.stores": stores,
        uberEatsUserToken: accessToken,
        uberEatsUserTokenExpiresAt: expiresAt,
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return { stores };
}

export async function activateSavedUberStore(storeId, staff) {
  const cleanStoreId = clip(storeId, 128);
  const settings = await StoreSettings.findOne({ key: "main" })
    .select("+uberEatsUserToken uberEatsUserTokenExpiresAt uberEats")
    .lean();
  const store = settings?.uberEats?.stores?.find((candidate) => candidate.storeId === cleanStoreId);
  if (!store) throw new UberProvisioningError("Esa tienda no está en la lista que regresó Uber", "UBER_UNKNOWN_STORE", 400);

  const token = settings?.uberEatsUserToken;
  const expired = !settings?.uberEatsUserTokenExpiresAt || new Date(settings.uberEatsUserTokenExpiresAt) <= new Date();
  if (!token || expired) {
    throw new UberProvisioningError("El permiso de Uber venció. Vuelve a tocar «Conectar con Uber».", "UBER_TOKEN_EXPIRED", 409);
  }

  await activateUberStore(token, store.storeId);
  await StoreSettings.updateOne(
    { key: "main" },
    {
      $set: {
        "uberEats.activeStoreId": store.storeId,
        "uberEats.activeStoreName": store.name,
        "uberEats.activatedAt": new Date(),
        "uberEats.activatedBy": clip(staff?.name, 80) || null,
        "uberEats.deactivatedAt": null,
        uberEatsUserToken: null,
        uberEatsUserTokenExpiresAt: null,
      },
    }
  );
  return store;
}

export async function getUberProvisioningStatus() {
  const config = getUberEatsConfig();
  const settings = await StoreSettings.findOne({ key: "main" })
    .select("uberEats uberEatsUserTokenExpiresAt")
    .lean();
  const uber = settings?.uberEats || {};
  const tokenValid = Boolean(settings?.uberEatsUserTokenExpiresAt)
    && new Date(settings.uberEatsUserTokenExpiresAt) > new Date();
  return {
    configured: Boolean(config.clientId && config.clientSecret),
    environment: config.environment,
    redirectUri: config.redirectUri,
    connectedAt: uber.connectedAt || null,
    connectedBy: uber.connectedBy || null,
    stores: tokenValid ? uber.stores || [] : [],
    canActivate: tokenValid,
    activeStoreId: uber.activeStoreId || null,
    activeStoreName: uber.activeStoreName || null,
    activatedAt: uber.activatedAt || null,
    activatedBy: uber.activatedBy || null,
    deactivatedAt: uber.deactivatedAt || null,
  };
}
