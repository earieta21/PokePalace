import express from "express";
import { optionalAuth, protect } from "../middleware/authMiddleware.js";
import { createOrder, cancelOrder, getMyOrders, getOrderById } from "../controllers/orderController.js";

const router = express.Router();

router.post("/", optionalAuth, createOrder);           // POST /api/orders
router.get("/mine", protect, getMyOrders);             // GET  /api/orders/mine
router.patch("/:id/cancel", optionalAuth, cancelOrder);// PATCH /api/orders/:id/cancel
router.get("/:id", optionalAuth, getOrderById);        // GET  /api/orders/:id

export default router;
