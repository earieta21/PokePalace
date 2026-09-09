import express from "express";
import { receiveTelegramFinanceWebhook } from "../controllers/telegramFinanceController.js";
import { financeBotConfigured } from "../utils/telegramFinanceBot.js";
import { cloudinaryConfigured } from "../utils/cloudinary.js";

const router = express.Router();

router.post("/finance-webhook", receiveTelegramFinanceWebhook);

/* GET /api/telegram/finance-status?secret=... — diagnóstico de qué variable
   de entorno falta, sin exponer ningún valor. Protegido con el mismo
   TELEGRAM_FINANCE_WEBHOOK_SECRET para que no sea información pública. */
router.get("/finance-status", (req, res) => {
  const secret = process.env.TELEGRAM_FINANCE_WEBHOOK_SECRET;
  if (!secret || req.query.secret !== secret) return res.sendStatus(404);

  res.json({
    TELEGRAM_FINANCE_BOT_TOKEN: Boolean(process.env.TELEGRAM_FINANCE_BOT_TOKEN),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    TELEGRAM_FINANCE_WEBHOOK_SECRET: Boolean(process.env.TELEGRAM_FINANCE_WEBHOOK_SECRET),
    TELEGRAM_FINANCE_ACCESS_CODE: Boolean(process.env.TELEGRAM_FINANCE_ACCESS_CODE),
    TELEGRAM_FISCAL_CHAT_ID: Boolean(process.env.TELEGRAM_FISCAL_CHAT_ID),
    CLOUDINARY_CLOUD_NAME: Boolean(process.env.CLOUDINARY_CLOUD_NAME),
    CLOUDINARY_API_KEY: Boolean(process.env.CLOUDINARY_API_KEY),
    CLOUDINARY_API_SECRET: Boolean(process.env.CLOUDINARY_API_SECRET),
    financeBotConfigured: financeBotConfigured(),
    cloudinaryConfigured: cloudinaryConfigured(),
  });
});

export default router;
