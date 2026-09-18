import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { createPairing, confirmPairing, getPairingStatus } from "../controllers/kioskPairingController.js";

const router = express.Router();

// Generoso pero acotado: el kiosco crea uno por checkout, y un celular
// intentando adivinar tokens de 32 hex chars no llega a ningún lado antes
// de toparse con este límite.
const pairingLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

router.post("/", pairingLimiter, createPairing);
router.get("/:token", pairingLimiter, getPairingStatus);
router.post("/:token/confirm", pairingLimiter, protect, confirmPairing);

export default router;
