import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { createCalendarEntry, deleteCalendarEntry, getCalendar, updateCalendarEntry } from "../controllers/staffCalendarController.js";

const router = express.Router();
router.use(requireStaffAuth());
router.get("/", getCalendar);
router.post("/", createCalendarEntry);
router.patch("/:id", updateCalendarEntry);
router.delete("/:id", deleteCalendarEntry);
export default router;
