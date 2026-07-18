import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { previewTestData, resetTestData } from "../controllers/adminController.js";

const router = express.Router();

// Borrar historial del negocio es lo más destructivo que existe en la app:
// solo dueño/admin, y el POST además exige la frase de confirmación exacta.
const ownerOnly = requireStaffAuth(["owner", "admin"]);

router.get ("/test-data",       ownerOnly, previewTestData);
router.post("/reset-test-data", ownerOnly, resetTestData);

export default router;
