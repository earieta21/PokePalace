import express from "express";
import {
  staffLogin,
  pinLogin,
  pinUpgrade,
  passkeyLogin,
  passkeyLoginOptions,
  passkeyRegister,
  passkeyRegisterOptions,
} from "../controllers/staffAuthController.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";

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

// Face ID no se puede adivinar como un PIN (cada intento lleva una firma),
// así que el límite solo frena abuso, no fuerza bruta.
const passkeyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: "Demasiados intentos con Face ID. Espera unos minutos o entra con tu PIN.",
});

router.post("/login", loginLimiter, staffLogin);
router.post("/pin-login", pinLimiter, pinLogin);
// Solo acepta el token corto que entrega pin-login a gerencia con PIN de 4.
router.post("/pin-upgrade", loginLimiter, pinUpgrade);

router.post("/passkey/login-options", passkeyLimiter, passkeyLoginOptions);
router.post("/passkey/login", passkeyLimiter, passkeyLogin);
router.post("/passkey/register-options", passkeyLimiter, requireStaffAuth(), passkeyRegisterOptions);
router.post("/passkey/register", passkeyLimiter, requireStaffAuth(), passkeyRegister);

export default router;
