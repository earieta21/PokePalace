import { createHmac, timingSafeEqual } from "node:crypto";
import WhatsAppSession from "../models/WhatsAppSession.js";
import { runWhatsAppAgent, whatsappAgentConfigured } from "../services/whatsappAgent.js";
import { sendWhatsAppText } from "../utils/notify.js";
import { logServerError } from "./monitorController.js";

const MAX_PROCESSED_IDS = 20;

/* GET /api/whatsapp/webhook — handshake de verificación de Meta. */
export function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

const isValidSignature = (req) => {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const header = req.get("x-hub-signature-256") || "";
  if (!secret || !header.startsWith("sha256=") || !req.rawBody) return false;

  const expectedHex = createHmac("sha256", secret).update(req.rawBody).digest("hex");
  const providedHex = header.slice("sha256=".length);
  if (expectedHex.length !== providedHex.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(providedHex, "hex"));
  } catch {
    return false;
  }
};

const extractIncomingMessage = (body) => {
  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (typeof message?.from !== "string" || typeof message?.id !== "string") return null;
  return {
    from: message.from,
    wamid: message.id,
    type: message.type,
    text: message.type === "text" ? String(message.text?.body || "") || null : null,
  };
};

/* POST /api/whatsapp/webhook — mensajes entrantes de clientes.
   Siempre se contesta 200 de inmediato (Meta reintenta si no hay ack rápido);
   el resto se procesa después, y la respuesta al cliente llega como un
   mensaje de WhatsApp aparte, no en el cuerpo de esta petición. */
export async function handleWebhook(req, res) {
  // Sin las credenciales completas el feature simplemente no está activo —
  // se hace ack para no generar reintentos infinitos de Meta.
  if (!whatsappAgentConfigured() || !process.env.WHATSAPP_APP_SECRET) {
    return res.sendStatus(200);
  }
  if (!isValidSignature(req)) return res.sendStatus(401);

  res.sendStatus(200);

  let incoming;
  try {
    incoming = extractIncomingMessage(req.body);
  } catch (err) {
    logServerError(err, "POST /api/whatsapp/webhook (parse)");
    return;
  }
  if (!incoming) return; // recibos de entrega/lectura u otros eventos sin mensaje

  try {
    let session = await WhatsAppSession.findOne({ phone: incoming.from });
    if (!session) session = new WhatsAppSession({ phone: incoming.from });

    if (session.processedMessageIds.includes(incoming.wamid)) return; // reintento de Meta ya atendido
    session.processedMessageIds.push(incoming.wamid);
    if (session.processedMessageIds.length > MAX_PROCESSED_IDS) {
      session.processedMessageIds = session.processedMessageIds.slice(-MAX_PROCESSED_IDS);
    }

    if (incoming.type !== "text" || !incoming.text) {
      await session.save();
      await sendWhatsAppText(incoming.from, "Por ahora solo puedo leer mensajes de texto 🙂 ¿me escribes lo que quieres pedir?");
      return;
    }

    const reply = await runWhatsAppAgent(session, incoming.from, incoming.text);
    await session.save();
    await sendWhatsAppText(incoming.from, reply);
  } catch (err) {
    logServerError(err, "POST /api/whatsapp/webhook");
    sendWhatsAppText(
      incoming.from,
      "Tuvimos un problema procesando tu mensaje. Intenta de nuevo en un momento o llámanos al restaurante."
    ).catch(() => {});
  }
}
