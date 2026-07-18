import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  getInventory,
  getLowStock,
  createItem,
  updateItem,
  restockItem,
  restockBatch,
  deleteItem,
} from "../controllers/staffInventoryController.js";

const router = express.Router();

const anyStaff    = requireStaffAuth([]);
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.get   ("/low-stock", anyStaff, getLowStock);
router.get   ("/",          anyStaff, getInventory);
router.post  ("/",    seniorStaff, createItem);
router.post  ("/restock-batch", seniorStaff, restockBatch);
router.patch ("/:id", seniorStaff, updateItem);
router.patch ("/:id/restock", seniorStaff, restockItem);
router.delete("/:id", seniorStaff, deleteItem);

export default router;
