import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { getCashCutPreview, createCashCut, getCashCuts } from "../controllers/cashCutController.js";

const router = express.Router();
// Quien toca la caja física puede hacer el corte -- no solo gerencia.
const cashHandlingStaff = requireStaffAuth(["cashier", "manager", "admin", "owner"]);

router.get ("/preview", cashHandlingStaff, getCashCutPreview);
router.get ("/",        cashHandlingStaff, getCashCuts);
router.post("/",        cashHandlingStaff, createCashCut);

export default router;
