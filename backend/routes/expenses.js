import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  getExpenses,
  getFinanceSummary,
  createExpense,
  deleteExpense,
} from "../controllers/expenseController.js";

const router = express.Router();
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.get ("/summary", seniorStaff, getFinanceSummary);
router.get ("/",        seniorStaff, getExpenses);
router.post("/",        seniorStaff, createExpense);
router.delete("/:id",  seniorStaff, deleteExpense);

export default router;
