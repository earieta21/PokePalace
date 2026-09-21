import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  createPreparation,
  deletePreparation,
  listPreparations,
  updatePreparation,
} from "../controllers/preparationController.js";

const router = express.Router();

// Las recetas llevan costos del negocio: mismo alcance que el Costeo.
const managementOnly = requireStaffAuth(["manager", "admin", "owner"]);

router.get("/", managementOnly, listPreparations);
router.post("/", managementOnly, createPreparation);
router.put("/:id", managementOnly, updatePreparation);
router.delete("/:id", managementOnly, deletePreparation);

export default router;
