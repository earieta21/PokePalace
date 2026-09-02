import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { getWeeklySummary, getSummaryWeeks } from "../controllers/summaryController.js";

const router = express.Router();
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.get("/weeks", seniorStaff, getSummaryWeeks); // GET /api/staff/summary/weeks
router.get("/", seniorStaff, getWeeklySummary);       // GET /api/staff/summary

export default router;
