import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  getInventory,
  getLowStock,
  createItem,
  updateItem,
  restockItem,
  restockBatch,
  backfillInventoryExpenses,
  resetInventoryValues,
  deleteItem,
  getItemMovements,
} from "../controllers/staffInventoryController.js";

const router = express.Router();

const anyStaff    = requireStaffAuth([]);
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);
const ownerOnly   = requireStaffAuth(["admin", "owner"]);

router.get   ("/low-stock", anyStaff, getLowStock);
router.get   ("/",          anyStaff, getInventory);
router.post  ("/",    seniorStaff, createItem);
router.post  ("/restock-batch", seniorStaff, restockBatch);
router.post  ("/backfill-expenses", ownerOnly, backfillInventoryExpenses);
router.post  ("/reset-values", ownerOnly, resetInventoryValues);
router.patch ("/:id", seniorStaff, updateItem);
router.patch ("/:id/restock", seniorStaff, restockItem);
router.delete("/:id", seniorStaff, deleteItem);
router.get   ("/:id/movements", anyStaff, getItemMovements);

export default router;
