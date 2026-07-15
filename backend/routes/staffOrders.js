import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  getAllOrders,
  updateOrderStatus,
  markAsPaid,
  getOrderStats,
  createPosOrder,
  getAnalytics,
  getFinance,
  searchRewardCustomers,
} from "../controllers/staffOrderController.js";

const router = express.Router();

const anyStaff    = requireStaffAuth([]);
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.get  ("/stats",         anyStaff,    getOrderStats);
router.get  ("/analytics",     seniorStaff, getAnalytics);
router.get  ("/finance",       seniorStaff, getFinance);
router.get  ("/customers/search", anyStaff, searchRewardCustomers);
router.get  ("/",              anyStaff,    getAllOrders);
router.post ("/",              anyStaff,    createPosOrder);
router.patch("/:id/status",    anyStaff,    updateOrderStatus);
router.patch("/:id/pay",       anyStaff,    markAsPaid);

export default router;
