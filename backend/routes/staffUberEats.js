import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  activateUberStoreHandler,
  getUberStatus,
  startUberConnect,
} from "../controllers/uberEatsProvisioningController.js";

const router = express.Router();
// Vincular la tienda con Uber decide quién recibe y acepta los pedidos de
// la plataforma: solo dueño y admin.
const ownerOrAdmin = requireStaffAuth(["owner", "admin"]);

router.get ("/status",   ownerOrAdmin, getUberStatus);
router.post("/connect",  ownerOrAdmin, startUberConnect);
router.post("/activate", ownerOrAdmin, activateUberStoreHandler);

export default router;
