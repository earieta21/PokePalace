import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { getFiscalSummary } from "../controllers/fiscalController.js";

const router = express.Router();

// Información fiscal del negocio: solo dueño/admin.
const ownerOnly = requireStaffAuth(["owner", "admin"]);

router.get("/", ownerOnly, getFiscalSummary);

export default router;
