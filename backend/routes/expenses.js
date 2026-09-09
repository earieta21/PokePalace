import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  getExpenses,
  getFinanceSummary,
  createExpense,
  updateExpense,
  deleteExpense,
} from "../controllers/expenseController.js";

const router = express.Router();
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.get  ("/summary", seniorStaff, getFinanceSummary);
router.get  ("/",        seniorStaff, getExpenses);
router.post ("/",        seniorStaff, createExpense);
router.patch("/:id",     seniorStaff, updateExpense);
router.delete("/:id",    seniorStaff, deleteExpense);

export default router;
