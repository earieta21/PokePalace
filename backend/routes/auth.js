import express from "express";
import { register, login } from "../controllers/authController.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = express.Router();

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Demasiadas cuentas creadas desde este dispositivo. Intenta más tarde.",
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Demasiados intentos de acceso. Espera 15 minutos e intenta de nuevo.",
});

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);

export default router;
