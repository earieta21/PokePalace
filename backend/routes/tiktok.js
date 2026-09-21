import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { connectTikTok, tiktokCallback } from "../controllers/tiktokAuthController.js";

const router = express.Router();

// Solo dueño/admin pueden (re)conectar la cuenta de TikTok del negocio.
router.get("/connect", requireStaffAuth(["admin", "owner"]), connectTikTok);

// TikTok redirige aquí solo — no puede mandar un Bearer token, así que esta
// ruta va sin requireStaffAuth. Su seguridad la da el `state` firmado (JWT
// de 10 min) generado únicamente por /connect, más el intercambio real del
// `code` con el client_secret del servidor.
router.get("/callback", tiktokCallback);

export default router;
