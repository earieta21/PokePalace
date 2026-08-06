import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  getTodayCashCut,
  openCashCut,
  updateCashCut,
  closeCashCut,
  reopenCashCut,
  getCashCuts,
} from "../controllers/cashCutController.js";

const router = express.Router();
// Quien toca la caja física puede abrir/cerrar el cierre -- no solo gerencia.
const cashHandlingStaff = requireStaffAuth(["cashier", "manager", "admin", "owner"]);
const ownerOnly = requireStaffAuth(["admin", "owner"]);

router.get  ("/today",       cashHandlingStaff, getTodayCashCut);
router.get  ("/",            cashHandlingStaff, getCashCuts);
router.post ("/",            cashHandlingStaff, openCashCut);
router.patch("/:id",         cashHandlingStaff, updateCashCut);
router.patch("/:id/close",   cashHandlingStaff, closeCashCut);
router.patch("/:id/reopen",  ownerOnly,         reopenCashCut);

export default router;