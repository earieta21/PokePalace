import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  applyCostingTemplate,
  getCosting,
  previewCostingTemplate,
  updateCosting,
} from "../controllers/costingController.js";

const router = express.Router();

// Costos y márgenes solo para quien maneja el negocio — no para caja o cocina.
const managementOnly = requireStaffAuth(["manager", "admin", "owner"]);

router.get("/", managementOnly, getCosting);
router.put("/", managementOnly, updateCosting);
router.get("/template", managementOnly, previewCostingTemplate);
router.post("/template", managementOnly, applyCostingTemplate);

export default router;
