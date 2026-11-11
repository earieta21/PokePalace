import express from "express";
import {
  exportCustomers,
  getCustomerDetail,
  getCustomerSummary,
  getRegisteredCustomers,
} from "../controllers/staffCustomersController.js";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";

const router = express.Router();
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);
// Descargar la lista completa de correos y teléfonos queda para dueño/admin.
const ownerOrAdmin = requireStaffAuth(["admin", "owner"]);

router.get("/", seniorStaff, getRegisteredCustomers);
// Antes de "/:id" para que "summary" y "export" no se lean como un id.
router.get("/summary", seniorStaff, getCustomerSummary);
router.get("/export", ownerOrAdmin, exportCustomers);
router.get("/:id", seniorStaff, getCustomerDetail);

export default router;
