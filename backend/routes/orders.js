import express from "express";
import { optionalAuth, protect } from "../middleware/authMiddleware.js";
import { createOrder, cancelOrder, getMyOrders, getOrderById, getWaitTime, clipWebhook } from "../controllers/orderController.js";

const router = express.Router();

router.post("/", optionalAuth, createOrder);           // POST /api/orders
router.get("/wait-time", getWaitTime);                 // GET  /api/orders/wait-time (must be before /:id)
router.get("/mine", protect, getMyOrders);             // GET  /api/orders/mine
router.post("/clip-webhook", clipWebhook);             // POST /api/orders/clip-webhook (must be before /:id)
router.patch("/:id/cancel", optionalAuth, cancelOrder);// PATCH /api/orders/:id/cancel
router.get("/:id", optionalAuth, getOrderById);        // GET  /api/orders/:id

export default router;
