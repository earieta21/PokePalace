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
// Mismos permisos que Inventario: quien ve la pestaña puede mover existencias.
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.get   ("/",              anyStaff,    listDisposables);
router.post  ("/",              seniorStaff, createDisposable);
router.patch ("/:id",           seniorStaff, updateDisposable);
router.post  ("/:id/receive",   seniorStaff, receiveDisposable);
router.post  ("/:id/use",       seniorStaff, useDisposable);
router.post  ("/:id/count",     seniorStaff, countDisposable);
router.delete("/:id",           seniorStaff, deleteDisposable);
router.get   ("/:id/movements", anyStaff,    listDisposableMovements);

export default router;
