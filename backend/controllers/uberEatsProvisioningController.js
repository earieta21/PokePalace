import { logServerError } from "./monitorController.js";
import {
  UberProvisioningError,
  activateSavedUberStore,
  buildAuthorizeUrl,
  completeUberAuthorization,
  createOAuthState,
  getUberProvisioningStatus,
} from "../services/uberEatsProvisioning.js";

const SITE_URL = (process.env.SITE_URL || "https://pokepalace.org").replace(/\/+$/, "");

const sendError = async (res, error, where) => {
  if (error instanceof UberProvisioningError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  await logServerError(error, where);
  return res.status(500).json({ message: "No se pudo completar la conexión con Uber" });
};

/* GET /api/staff/integrations/uber/status */
export async function getUberStatus(req, res) {
  try {
    res.json(await getUberProvisioningStatus());
  } catch (error) {
    await sendError(res, error, "GET /api/staff/integrations/uber/status");
  }
}

/* POST /api/staff/integrations/uber/connect — devuelve el enlace de Uber */
export async function startUberConnect(req, res) {
  try {
    res.json({ url: buildAuthorizeUrl(createOAuthState(req.staff)) });
  } catch (error) {
    await sendError(res, error, "POST /api/staff/integrations/uber/connect");
  }
}

/* POST /api/staff/integrations/uber/activate — body: { storeId } */
export async function activateUberStoreHandler(req, res) {
  try {
    const store = await activateSavedUberStore(req.body?.storeId, req.staff);
    res.json({ store, status: await getUberProvisioningStatus() });
  } catch (error) {
    await sendError(res, error, "POST /api/staff/integrations/uber/activate");
  }
}

/* GET /api/integrations/uber/oauth/callback — Uber regresa aquí al dueño */
export async function uberOAuthCallback(req, res) {
  const back = (params) => res.redirect(302, `${SITE_URL}/staff?${new URLSearchParams(params)}`);
  if (req.query.error) {
    return back({ uber: "error", motivo: String(req.query.error_description || req.query.error).slice(0, 200) });
  }
  try {
    const { stores } = await completeUberAuthorization({ code: req.query.code, state: req.query.state });
    return back({ uber: "conectado", tiendas: String(stores.length) });
  } catch (error) {
    if (!(error instanceof UberProvisioningError)) await logServerError(error, "GET /api/integrations/uber/oauth/callback");
    return back({ uber: "error", motivo: error instanceof UberProvisioningError ? error.message : "Error inesperado al conectar con Uber" });
  }
}
