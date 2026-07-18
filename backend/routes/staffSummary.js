import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { getWeeklySummary } from "../controllers/summaryController.js";

const router = express.Router();
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.get("/", seniorStaff, getWeeklySummary);

export default router;
