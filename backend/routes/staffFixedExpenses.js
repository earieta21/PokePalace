import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  getFixedExpenses,
  createFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
  getPayrollWeeks,
  registerPayrollExpense,
} from "../controllers/fixedExpenseController.js";

const router = express.Router();
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);
// Configurar cuánto se anota solo cada mes, y cuánto se paga de nómina, es
// decisión de dueño/admin — un gerente puede consultarlo pero no cambiarlo.
const ownerOnly = requireStaffAuth(["admin", "owner"]);

router.get   ("/payroll/weeks",    seniorStaff, getPayrollWeeks);
router.post  ("/payroll/register", ownerOnly,   registerPayrollExpense);

router.get   ("/",    seniorStaff, getFixedExpenses);
router.post  ("/",    ownerOnly,   createFixedExpense);
router.patch ("/:id", ownerOnly,   updateFixedExpense);
router.delete("/:id", ownerOnly,   deleteFixedExpense);

export default router;
