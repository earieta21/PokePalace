import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { getCosting, updateCosting } from "../controllers/costingController.js";

const router = express.Router();

// Costos y márgenes solo para quien maneja el negocio — no para caja o cocina.
const managementOnly = requireStaffAuth(["manager", "admin", "owner"]);

router.get("/", managementOnly, getCosting);
router.put("/", managementOnly, updateCosting);

export default router;
