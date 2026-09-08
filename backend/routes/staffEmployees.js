import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "../controllers/staffEmployeesController.js";

const router = express.Router();

const managerPlus = requireStaffAuth(["manager", "admin", "owner"]);
const adminPlus   = requireStaffAuth(["admin", "owner"]);

router.get   ("/",    managerPlus, getEmployees);
router.post  ("/",    adminPlus,   createEmployee);
router.patch ("/:id", adminPlus,   updateEmployee);
router.delete("/:id", adminPlus,   deleteEmployee);

export default router;
