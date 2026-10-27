import { useEffect, useState } from "react";
import { API_URL } from "../config";

/* Entrar al portal con Face ID (o huella en Android) usando passkeys
   (WebAuthn). La llave privada vive en el teléfono; el backend solo guarda
   la pública (backend/utils/webauthn.js). El PIN sigue siendo el respaldo.

   En localStorage se recuerda qué empleado activó Face ID en este
   dispositivo (solo ids, nada secreto) para mostrar el botón de entrada y
   para no ofrecer la función en un equipo que ya usa otra persona. */

const DEVICE_KEY = "pp.staff.passkeys";
const DISMISSED_KEY = "pp.staff.passkeyDismissed";

const toB64url = (buffer) => {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64url = (value) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

const readJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const writeJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* modo privado */ }
};

// credentialId puede ser null si el teléfono ya tenía la passkey (p. ej. se
// borró el almacenamiento del navegador): en ese caso se entra eligiéndola
// del llavero en vez de indicarla por id.
export const getDevicePasskeys = () => {
  const list = readJSON(DEVICE_KEY, []);
  return Array.isArray(list) ? list.filter((p) => p?.userId) : [];
};

const rememberDevicePasskey = (userId, credentialId) => {
  const others = getDevicePasskeys().filter((p) => p.userId !== String(userId));
  writeJSON(DEVICE_KEY, [...others, { userId: String(userId), credentialId }]);
};

const forgetDevicePasskey = (credentialId) =>
  writeJSON(DEVICE_KEY, getDevicePasskeys().filter((p) => p.credentialId && p.credentialId !== credentialId));

// "Ahora no" pospone la oferta un mes en vez de volver a preguntar cada turno.
const OFFER_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const readDismissed = () => {
  const value = readJSON(DISMISSED_KEY, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
};

export const dismissPasskeyOffer = (userId) =>
  writeJSON(DISMISSED_KEY, { ...readDismissed(), [String(userId)]: Date.now() });

const userAgent = () => (typeof navigator === "undefined" ? "" : navigator.userAgent || "");
const isIPhone = () => /iPhone|iPod/.test(userAgent());
const isAndroidPhone = () => /Android/.test(userAgent()) && /Mobile/.test(userAgent());

// Solo se ofrece en teléfonos: la tableta y la compu del local son
// compartidas, y ahí cualquiera que sepa el código del equipo podría entrar
// con la passkey de otra persona. Si otra cuenta ya lo activó en este
// teléfono, tampoco se ofrece.
export function shouldOfferPasskey(userId) {
  if (!isIPhone() && !isAndroidPhone()) return false;
  const dismissedAt = Number(readDismissed()[String(userId)]) || 0;
  if (Date.now() - dismissedAt < OFFER_SNOOZE_MS) return false;
  return getDevicePasskeys().length === 0;
}

export const biometricLabel = () => (isAndroidPhone() ? "huella" : "Face ID");

// Las passkeys se registran para pokepalace.org (ver backend/utils/webauthn.js).
const isSupportedOrigin = () => {
  if (typeof location === "undefined") return false;
  const { protocol, hostname } = location;
  if (protocol === "http:") return hostname === "localhost";
  return protocol === "https:" && (hostname === "pokepalace.org" || hostname.endsWith(".pokepalace.org"));
};

// Face ID / huella disponibles en este navegador y dominio.
export function usePasskeySupport() {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    let alive = true;
    const pkc = typeof window !== "undefined" ? window.PublicKeyCredential : undefined;
    const attestation = typeof window !== "undefined" ? window.AuthenticatorAttestationResponse : undefined;
    if (
      !isSupportedOrigin() ||
      !pkc?.isUserVerifyingPlatformAuthenticatorAvailable ||
      typeof attestation?.prototype?.getPublicKey !== "function"
    ) {
      return undefined;
    }
    pkc.isUserVerifyingPlatformAuthenticatorAvailable()
      .then((ok) => { if (alive) setSupported(Boolean(ok)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return supported;
}

async function postJSON(path, body, token) {
  let r;
  try {
    r = await fetch(`${API_URL}/api/staff-auth${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body || {}),
    });
  } catch {
    throw new Error("Sin conexión con el servidor. Intenta de nuevo.");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.message || data.msg || "No se pudo completar la verificación.");
    err.code = data.code;
    throw err;
  }
  return data;
}

/* Safari solo abre Face ID si la llamada sale casi directo del toque del
   usuario; esperar al servidor en medio puede hacer que la cancele. Por eso
   el challenge se pide antes (prepare*) y al tocar el botón solo se usa.
   El servidor lo acepta 180 s; pasado ese margen se pide de nuevo. */
const PREPARED_TTL_MS = 150 * 1000;
const stamp = (data) => ({ ...data, preparedAt: Date.now() });
const isFresh = (prepared) => Boolean(prepared) && Date.now() - prepared.preparedAt < PREPARED_TTL_MS;

export const preparePasskeyLogin = () => postJSON("/passkey/login-options").then(stamp);
export const preparePasskeyRegistration = (token) => postJSON("/passkey/register-options", {}, token).then(stamp);

// El usuario canceló el diálogo de Face ID o se agotó el tiempo.
export const isPasskeyCancel = (err) => err?.name === "NotAllowedError" || err?.name === "AbortError";

export async function registerPasskey(token, userId, prepared) {
  const { challengeToken, options } = isFresh(prepared) ? prepared : await preparePasskeyRegistration(token);
  let credential;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        ...options,
        challenge: fromB64url(options.challenge),
        user: { ...options.user, id: fromB64url(options.user.id) },
        excludeCredentials: options.excludeCredentials.map((c) => ({ ...c, id: fromB64url(c.id) })),
      },
    });
  } catch (err) {
    // El teléfono ya tenía una passkey de esta cuenta (excludeCredentials):
    // basta con volver a mostrar el botón de entrada.
    if (err?.name === "InvalidStateError") {
      rememberDevicePasskey(userId, null);
      return;
    }
    throw err;
  }
  const { response } = credential;
  const { credentialId } = await postJSON("/passkey/register", {
    challengeToken,
    deviceLabel: biometricLabel(),
    credential: {
      id: toB64url(credential.rawId),
      response: {
        clientDataJSON: toB64url(response.clientDataJSON),
        authenticatorData: toB64url(response.getAuthenticatorData()),
        publicKey: toB64url(response.getPublicKey()),
        publicKeyAlgorithm: response.getPublicKeyAlgorithm(),
        transports: response.getTransports?.() || [],
      },
    },
  }, token);
  rememberDevicePasskey(userId, credentialId);
}

// `signal` cancela el diálogo de Face ID si la persona entra con PIN mientras
// sigue abierto (el login lo abre solo al cargar).
export async function loginWithPasskey(locationId, prepared, signal) {
  const { challengeToken, options } = isFresh(prepared) ? prepared : await preparePasskeyLogin();
  const known = getDevicePasskeys().filter((p) => p.credentialId);
  const credential = await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: fromB64url(options.challenge),
      allowCredentials: known.map((p) => ({ type: "public-key", id: fromB64url(p.credentialId) })),
    },
    signal,
  });
  const { response } = credential;
  const id = toB64url(credential.rawId);
  try {
    return await postJSON("/passkey/login", {
      challengeToken,
      locationId,
      supportsPinUpgrade: true, // ver handleLogin en UnifiedStaffApp.jsx
      credential: {
        id,
        response: {
          clientDataJSON: toB64url(response.clientDataJSON),
          authenticatorData: toB64url(response.authenticatorData),
          signature: toB64url(response.signature),
          userHandle: response.userHandle ? toB64url(response.userHandle) : null,
        },
      },
    });
  } catch (err) {
    // La passkey se borró en el servidor (o el empleado fue eliminado).
    if (err.code === "unknown_credential") forgetDevicePasskey(id);
    throw err;
  }
}
