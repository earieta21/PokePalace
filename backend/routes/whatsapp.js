import express from "express";
import { rateLimit } from "../middleware/rateLimit.js";
import { verifyWebhook, handleWebhook } from "../controllers/whatsappController.js";

const router = express.Router();

// Todas las peticiones legítimas llegan desde las IPs de Meta, no del
// cliente — el límite se aplica por número de teléfono, no por IP.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Demasiados mensajes seguidos, espera un momento.",
  keyFn: (req) => req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || req.ip,
});

router.get("/webhook", verifyWebhook);           // GET  /api/whatsapp/webhook (handshake de Meta)
router.post("/webhook", webhookLimiter, handleWebhook); // POST /api/whatsapp/webhook (mensajes entrantes)

export default router;
