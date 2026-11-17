import express from "express";
import { receiveUberEatsWebhook } from "../controllers/uberEatsController.js";
import { uberOAuthCallback } from "../controllers/uberEatsProvisioningController.js";

const router = express.Router();

router.post("/webhook", receiveUberEatsWebhook);
// Uber regresa aquí al dueño después de autorizar la app (Redirect URI).
router.get("/oauth/callback", uberOAuthCallback);

export default router;
