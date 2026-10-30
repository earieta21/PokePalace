import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  listDisposables,
  createDisposable,
  updateDisposable,
  receiveDisposable,
  useDisposable,
  countDisposable,
  deleteDisposable,
  listDisposableMovements,
} from "../controllers/staffDisposablesController.js";

const router = express.Router();

const anyStaff    = requireStaffAuth([]);
// Mismos permisos que Inventario: los empleados agregan y mueven existencias;
// editar o borrar el artículo es de gerencia.
const intakeStaff = requireStaffAuth(["employee", "manager", "admin", "owner"]);
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.get   ("/",              anyStaff,    listDisposables);
router.post  ("/",              intakeStaff, createDisposable);
router.patch ("/:id",           seniorStaff, updateDisposable);
router.post  ("/:id/receive",   intakeStaff, receiveDisposable);
router.post  ("/:id/use",       intakeStaff, useDisposable);
router.post  ("/:id/count",     intakeStaff, countDisposable);
router.delete("/:id",           seniorStaff, deleteDisposable);
router.get   ("/:id/movements", anyStaff,    listDisposableMovements);

export default router;
