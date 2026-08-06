import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { getAuditLog } from "../controllers/auditLogController.js";

const router = express.Router();
// Sensible -- misma gate que Finanzas, no todo el personal necesita ver
// quién cambió qué en todo el sistema.
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.get("/", seniorStaff, getAuditLog);

export default router;