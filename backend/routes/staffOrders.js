import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  getAllOrders,
  updateOrderStatus,
  getOrderStats,
  createPosOrder,
  getAnalytics,
  getFinance,
} from "../controllers/staffOrderController.js";

const router = express.Router();

const anyStaff    = requireStaffAuth([]);
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.get  ("/stats",         anyStaff,    getOrderStats);
router.get  ("/analytics",     seniorStaff, getAnalytics);
router.get  ("/finance",       seniorStaff, getFinance);
router.get  ("/",              anyStaff,    getAllOrders);
router.post ("/",              anyStaff,    createPosOrder);
router.patch("/:id/status",    anyStaff,    updateOrderStatus);

export default router;
