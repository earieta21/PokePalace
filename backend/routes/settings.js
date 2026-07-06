import express from "express";
import { getAvailability, setAvailability } from "../controllers/settingsController.js";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";

const router = express.Router();

router.get("/availability", getAvailability);
router.put("/availability", requireStaffAuth(["manager", "admin", "owner"]), setAvailability);

export default router;
