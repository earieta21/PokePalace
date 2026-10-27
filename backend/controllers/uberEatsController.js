import { logServerError } from "./monitorController.js";
import {
  processPendingUberEatsWebhooks,
  recordUberEatsWebhook,
  getUberEatsWebhookSecret,
  verifyUberWebhookSignature,
} from "../services/uberEats.js";

export async function receiveUberEatsWebhook(req, res) {
  const signature = req.get("x-uber-signature");
  if (!getUberEatsWebhookSecret()) {
    return res.status(503).end();
  }
  if (!verifyUberWebhookSignature(req.rawBody, signature)) {
    return res.status(401).end();
  }

  try {
    await recordUberEatsWebhook(req.rawBody, req.body || {});
    res.status(200).end();
    processPendingUberEatsWebhooks().catch((error) => logServerError(error, "uber-eats-webhook-worker"));
  } catch (error) {
    await logServerError(error, "POST /api/integrations/uber/webhook");
    res.status(503).end();
  }
}
