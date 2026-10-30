import express from "express";
import {
  getAvailability, setAvailability,
  getStoreStatus, setStoreStatus,
  getDeliveryCommissions, setDeliveryCommissions,
} from "../controllers/settingsController.js";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";

const router = express.Router();

const managerOnly = requireStaffAuth(["manager", "admin", "owner"]);
// Marcar agotados y pausar pedidos es operación diaria del local.
const operationsStaff = requireStaffAuth(["employee", "manager", "admin", "owner"]);

router.get("/availability", getAvailability);
router.put("/availability", operationsStaff, setAvailability);

router.get("/store-status", getStoreStatus);
router.put("/store-status", operationsStaff, setStoreStatus);

router.get("/delivery-commissions", managerOnly, getDeliveryCommissions);
router.patch("/delivery-commissions", managerOnly, setDeliveryCommissions);

export default router;
