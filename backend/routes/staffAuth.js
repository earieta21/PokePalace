import express from "express";
import { staffLogin, pinLogin } from "../controllers/staffAuthController.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = express.Router();

// PINs are only 4 digits (10,000 combinations) — without this limit, anyone
// could script through every combination and log in as staff within minutes.
const pinLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: "Demasiados intentos de PIN. Espera unos minutos e intenta de nuevo.",
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Demasiados intentos de acceso. Espera unos minutos e intenta de nuevo.",
});

router.post("/login", loginLimiter, staffLogin);
router.post("/pin-login", pinLimiter, pinLogin);

export default router;
