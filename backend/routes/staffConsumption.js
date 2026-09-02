import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  createConsumption,
  getConsumptions,
  voidConsumption,
} from "../controllers/staffConsumptionController.js";

const router = express.Router();

router.get("/", requireStaffAuth([]), getConsumptions);
router.post("/", requireStaffAuth([]), createConsumption);
router.delete("/:id", requireStaffAuth(["manager", "admin", "owner"]), voidConsumption);

export default router;
