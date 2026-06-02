import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  getWasteLogs,
  createWasteLog,
  getWasteStats,
} from "../controllers/staffWasteController.js";

const router = express.Router();

const anyStaff = requireStaffAuth([]);

router.get ("/stats", anyStaff, getWasteStats);
router.get ("/",      anyStaff, getWasteLogs);
router.post("/",      anyStaff, createWasteLog);

export default router;
