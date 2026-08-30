import express from "express";
import { optionalAuth, protect } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { createOrder, cancelOrder, getMyOrders, getOrderById, getWaitTime, paymentWebhook } from "../controllers/orderController.js";
import { streamOrderEvents } from "../utils/orderEvents.js";

const router = express.Router();

// Generous for real customers (nobody legitimately places 20 orders in 10 min),
// but blocks scripted floods aimed at racing the points/promo redemption checks.
const createOrderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: "Demasiados pedidos seguidos. Espera unos minutos e intenta de nuevo.",
});

// Conexiones SSE de seguimiento — sin auth (el evento no lleva datos del
// pedido, solo avisa "algo cambió"; el cliente vuelve a pedir SU pedido con
// GET /:id, que sí valida acceso). El límite es por si alguien intenta abrir
// muchas conexiones a la vez.
const eventsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Demasiadas conexiones seguidas, espera un momento.",
});

router.post("/", createOrderLimiter, optionalAuth, createOrder); // POST /api/orders
router.get("/events", eventsLimiter, streamOrderEvents); // GET  /api/orders/events (must be before /:id)
router.get("/wait-time", getWaitTime);                 // GET  /api/orders/wait-time (must be before /:id)
router.get("/mine", protect, getMyOrders);             // GET  /api/orders/mine
router.post("/payment-webhook", paymentWebhook);       // POST /api/orders/payment-webhook — configurar en el panel de Openpay (must be before /:id)
router.patch("/:id/cancel", optionalAuth, cancelOrder);// PATCH /api/orders/:id/cancel
router.get("/:id", optionalAuth, getOrderById);        // GET  /api/orders/:id

export default router;
