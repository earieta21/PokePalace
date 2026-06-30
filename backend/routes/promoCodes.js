import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import {
  validatePromoCode,
  createPromoCode,
  listPromoCodes,
  togglePromoCode,
} from "../controllers/promoController.js";

const router = express.Router();

const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

// Public: validate a code at checkout
router.post("/validate", validatePromoCode);

// Staff-only: manage codes
router.get("/",         seniorStaff, listPromoCodes);
router.post("/",        seniorStaff, createPromoCode);
router.patch("/:id",    seniorStaff, togglePromoCode);

export default router;
