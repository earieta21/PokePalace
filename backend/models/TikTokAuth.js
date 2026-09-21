import mongoose from "mongoose";

// Documento único (siempre el mismo _id) con las credenciales de la cuenta
// de TikTok conectada. El content-agent lee/renueva este mismo documento
// para publicar sin que el backend tenga que reenviar nada.
const tikTokAuthSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "tiktok-auth" },
    openId: { type: String, required: true },
    accessToken: { type: String, required: true, select: false },
    refreshToken: { type: String, required: true, select: false },
    scope: { type: String, default: "" },
    accessTokenExpiresAt: { type: Date, required: true },
    refreshTokenExpiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.TikTokAuth || mongoose.model("TikTokAuth", tikTokAuthSchema);
