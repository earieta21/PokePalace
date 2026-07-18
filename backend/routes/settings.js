import express from "express";
import {
  getAvailability, setAvailability,
  getStoreStatus, setStoreStatus,
} from "../controllers/settingsController.js";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";

const router = express.Router();

const managerOnly = requireStaffAuth(["manager", "admin", "owner"]);

router.get("/availability", getAvailability);
router.put("/availability", managerOnly, setAvailability);

router.get("/store-status", getStoreStatus);
router.put("/store-status", managerOnly, setStoreStatus);

export default router;
