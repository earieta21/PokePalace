import express from "express";
import { receiveTelegramFinanceWebhook } from "../controllers/telegramFinanceController.js";

const router = express.Router();

router.post("/finance-webhook", receiveTelegramFinanceWebhook);

export default router;
