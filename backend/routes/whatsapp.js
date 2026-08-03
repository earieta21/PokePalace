import express from "express";
import { verifyWhatsAppWebhook, receiveWhatsAppWebhook } from "../controllers/whatsappController.js";

const router = express.Router();

router.get("/webhook", verifyWhatsAppWebhook);
router.post("/webhook", receiveWhatsAppWebhook);

export default router;
