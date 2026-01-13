import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { createOrder, getMyOrders } from "../controllers/orderController.js";

const router = express.Router();

router.post("/", protect, createOrder);      // POST /api/orders
router.get("/mine", protect, getMyOrders);   // GET  /api/orders/mine

export default router;
