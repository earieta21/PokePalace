import express from "express";
import { receiveUberEatsWebhook } from "../controllers/uberEatsController.js";

const router = express.Router();

router.post("/webhook", receiveUberEatsWebhook);

export default router;
