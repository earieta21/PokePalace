import express from "express";
import { staffLogin } from "../controllers/staffAuthController.js";

const router = express.Router();

router.post("/login", staffLogin);

export default router;
