import jwt from "jsonwebtoken";

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

// video.publish alcanza para el flujo de Direct Post (FILE_UPLOAD) que usa
// el content-agent; no se pide video.upload porque no se usa el buzón de
// borradores.
const SCOPES = "video.publish";

export class TikTokAuthError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = "TikTokAuthError";
    this.details = details;
  }
}

function clean(value) {
  return String(value || "").trim();
}

export function getTikTokConfig(env = process.env) {
  const clientKey = clean(env.TIKTOK_CLIENT_KEY);
  const clientSecret = clean(env.TIKTOK_CLIENT_SECRET);
  const redirectUri = clean(env.TIKTOK_REDIRECT_URI);
  return { configured: Boolean(clientKey && clientSecret && redirectUri), clientKey, clientSecret, redirectUri };
}

/** Nonce anti-CSRF sin necesitar sesión: un JWT de corta duración firmado con JWT_SECRET. */
export function signState() {
  return jwt.sign({ purpose: "tiktok_oauth" }, process.env.JWT_SECRET, { expiresIn: "10m" });
}

export function verifyState(state) {
  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    return decoded.purpose === "tiktok_oauth";
  } catch {
    return false;
  }
}

export function buildAuthorizeUrl(state) {
  const config = getTikTokConfig();
  if (!config.configured) {
    throw new TikTokAuthError("Falta configurar TIKTOK_CLIENT_KEY/SECRET/REDIRECT_URI en el servidor.");
  }
  const params = new URLSearchParams({
    client_key: config.clientKey,
    scope: SCOPES,
    response_type: "code",
    redirect_uri: config.redirectUri,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function postTokenRequest(body) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new TikTokAuthError(data?.error_description || data?.error || "TikTok rechazó la solicitud de token.", data);
  }
  return data;
}

/** Intercambia el `code` que manda TikTok en el callback por los tokens reales. */
export async function exchangeCodeForToken(code) {
  const config = getTikTokConfig();
  if (!config.configured) {
    throw new TikTokAuthError("Falta configurar TIKTOK_CLIENT_KEY/SECRET/REDIRECT_URI en el servidor.");
  }
  return postTokenRequest({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
}

/** Renueva el access_token usando el refresh_token guardado (dura ~365 días). */
export async function refreshAccessToken(refreshToken) {
  const config = getTikTokConfig();
  if (!config.configured) {
    throw new TikTokAuthError("Falta configurar TIKTOK_CLIENT_KEY/SECRET en el servidor.");
  }
  return postTokenRequest({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}
