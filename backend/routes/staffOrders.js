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
  scanRewardCustomer,
} from "../controllers/staffOrderController.js";
import { streamOrderEvents } from "../utils/orderEvents.js";

const router = express.Router();

const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);
const orderReaders = requireStaffAuth(["cashier", "kitchen", "manager", "admin", "owner"]);
const posSalesStaff = requireStaffAuth(["employee", "cashier", "manager", "admin", "owner"]);

router.get  ("/events",        orderReaders, streamOrderEvents);
router.get  ("/stats",         posSalesStaff, getOrderStats);
router.get  ("/analytics",     seniorStaff, getAnalytics);
router.get  ("/finance",       seniorStaff, getFinance);
router.get  ("/customers/search", posSalesStaff, searchRewardCustomers);
router.post ("/customers/scan",   posSalesStaff, scanRewardCustomer);
router.get  ("/",              orderReaders, getAllOrders);
router.post ("/",              posSalesStaff, createPosOrder);
router.patch("/:id/status",    orderReaders, updateOrderStatus);
router.patch("/:id/pay",       posSalesStaff, markAsPaid);

export default router;
