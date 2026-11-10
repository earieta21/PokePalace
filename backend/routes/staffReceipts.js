import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  uploadReceipt,
  listReceipts,
  deleteReceipt,
  getReceiptSettings,
  updateReceiptSettings,
  sendReceiptsNow,
} from "../controllers/receiptController.js";

const router = express.Router();
// Mismos permisos que Finanzas; a quién y cuándo se manda lo decide dueño/admin.
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);
const ownerAdmin = requireStaffAuth(["admin", "owner"]);

const MAX_PHOTO_MB = 8;
const parseImage = express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: `${MAX_PHOTO_MB}mb` });

// Va después de la autenticación para no leer 8 MB de alguien sin sesión, y
// convierte los errores del parser en un mensaje claro (si no, el manejador
// global los reportaría como error 500).
const imageBody = (req, res, next) => parseImage(req, res, (err) => {
  if (!err) return next();
  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: `La foto pesa demasiado (máximo ${MAX_PHOTO_MB} MB).` });
  }
  return res.status(400).json({ message: "No se pudo leer la foto." });
});

router.get   ("/settings", seniorStaff, getReceiptSettings);
router.put   ("/settings", ownerAdmin,  updateReceiptSettings);
router.post  ("/send-now", ownerAdmin,  sendReceiptsNow);
router.get   ("/",         seniorStaff, listReceipts);
router.post  ("/",         seniorStaff, imageBody, uploadReceipt);
router.delete("/:id",      seniorStaff, deleteReceipt);

export default router;
