import TikTokAuth from "../models/TikTokAuth.js";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  signState,
  verifyState,
  TikTokAuthError,
} from "../utils/tiktokAuth.js";

const expiresAt = (seconds) => new Date(Date.now() + Number(seconds) * 1000);

/** Redirige al admin a la pantalla de consentimiento de TikTok. */
export const connectTikTok = (req, res) => {
  try {
    const url = buildAuthorizeUrl(signState());
    res.redirect(url);
  } catch (error) {
    if (error instanceof TikTokAuthError) {
      return res.status(503).send(error.message);
    }
    res.status(500).send("No se pudo iniciar la conexión con TikTok.");
  }
};

/** TikTok redirige aquí con ?code=...&state=... tras la autorización. */
export const tiktokCallback = async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    return res.status(400).send(`TikTok canceló la conexión: ${errorDescription || error}`);
  }
  if (!code || !verifyState(state)) {
    return res.status(400).send("Solicitud inválida o expirada. Intenta conectar de nuevo desde el panel.");
  }

  try {
    const token = await exchangeCodeForToken(code);
    await TikTokAuth.findByIdAndUpdate(
      "tiktok-auth",
      {
        openId: token.open_id,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        scope: token.scope,
        accessTokenExpiresAt: expiresAt(token.expires_in),
        refreshTokenExpiresAt: expiresAt(token.refresh_expires_in),
      },
      { upsert: true, new: true }
    );
    res.send("✅ Cuenta de TikTok conectada correctamente. Ya puedes cerrar esta pestaña.");
  } catch (err) {
    console.error("TikTok OAuth callback error:", err);
    const message = err instanceof TikTokAuthError ? err.message : "No se pudo completar la conexión con TikTok.";
    res.status(502).send(`❌ ${message}`);
  }
};
