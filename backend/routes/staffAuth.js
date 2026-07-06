import express from "express";
import { staffLogin, pinLogin } from "../controllers/staffAuthController.js";

const router = express.Router();

router.post("/login", staffLogin);
router.post("/pin-login", pinLogin);

export default router;
