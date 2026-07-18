import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { exportBackup, getBackupStatus } from "../controllers/backupController.js";

const router = express.Router();

// Solo dueño/admin: el respaldo contiene toda la base, incluidos clientes y nómina.
const ownerOnly = requireStaffAuth(["owner", "admin"]);

router.get("/status", ownerOnly, getBackupStatus);
router.get("/",       ownerOnly, exportBackup);

export default router;
