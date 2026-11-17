import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { RECEIPT_BUNDLE_TYPE } from "../utils/receiptDocuments.js";
import {
  uploadReceipt,
  listReceipts,
  deleteReceipt,
  getReceiptSettings,
  updateReceiptSettings,
  sendReceiptsNow,
  updateReceipt,
  getReceiptExpenseOptions,
  getReceiptDeliveries,
} from "../controllers/receiptController.js";

const router = express.Router();
// Mismos permisos que Finanzas; a quién y cuándo se manda lo decide dueño/admin.
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);
const ownerAdmin = requireStaffAuth(["admin", "owner"]);

const parseImage = express.raw({ type: ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/xml", "text/xml", RECEIPT_BUNDLE_TYPE], limit: "28mb" });

// Va después de la autenticación para no leer 8 MB de alguien sin sesión, y
// convierte los errores del parser en un mensaje claro (si no, el manejador
// global los reportaría como error 500).
const imageBody = (req, res, next) => parseImage(req, res, (err) => {
  if (!err) return next();
  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "El paquete pesa demasiado: máximo 8 MB por archivo y 20 MB en total." });
  }
  return res.status(400).json({ message: "No se pudo leer el archivo." });
});

router.get   ("/settings", seniorStaff, getReceiptSettings);
router.put   ("/settings", ownerAdmin,  updateReceiptSettings);
router.post  ("/send-now", ownerAdmin,  sendReceiptsNow);
router.get   ("/expense-options", seniorStaff, getReceiptExpenseOptions);
router.get   ("/deliveries", seniorStaff, getReceiptDeliveries);
router.get   ("/",         seniorStaff, listReceipts);
router.post  ("/",         seniorStaff, imageBody, uploadReceipt);
router.delete("/:id",      seniorStaff, deleteReceipt);
router.patch ("/:id",      seniorStaff, updateReceipt);

export default router;
