import express from "express";
import { optionalAuth, protect } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { createOrder, cancelOrder, getMyOrders, getOrderById, getWaitTime, clipWebhook } from "../controllers/orderController.js";

const router = express.Router();

// Generous for real customers (nobody legitimately places 20 orders in 10 min),
// but blocks scripted floods aimed at racing the points/promo redemption checks.
const createOrderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: "Demasiados pedidos seguidos. Espera unos minutos e intenta de nuevo.",
});

router.post("/", createOrderLimiter, optionalAuth, createOrder); // POST /api/orders
router.get("/wait-time", getWaitTime);                 // GET  /api/orders/wait-time (must be before /:id)
router.get("/mine", protect, getMyOrders);             // GET  /api/orders/mine
router.post("/clip-webhook", clipWebhook);             // POST /api/orders/clip-webhook (must be before /:id)
router.patch("/:id/cancel", optionalAuth, cancelOrder);// PATCH /api/orders/:id/cancel
router.get("/:id", optionalAuth, getOrderById);        // GET  /api/orders/:id

export default router;
