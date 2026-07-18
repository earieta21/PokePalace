import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  validatePromoCode,
  createPromoCode,
  listPromoCodes,
  togglePromoCode,
} from "../controllers/promoController.js";

const router = express.Router();

const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

// Loose limit so a scripted brute-force of promo codes isn't feasible,
// without getting in the way of a customer retrying a mistyped code.
const validateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Demasiados intentos. Espera unos minutos e intenta de nuevo.",
});

// Public: validate a code at checkout
router.post("/validate", validateLimiter, validatePromoCode);

// Staff-only: manage codes
router.get("/",         seniorStaff, listPromoCodes);
router.post("/",        seniorStaff, createPromoCode);
router.patch("/:id",    seniorStaff, togglePromoCode);

export default router;
