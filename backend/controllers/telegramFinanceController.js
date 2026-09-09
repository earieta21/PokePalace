/* Webhook del bot de Telegram para Finanzas — recibe la foto de una
   factura/ticket, la sube a Cloudinary, le pregunta al usuario de qué es (si
   no lo dijo ya) y llama al agente (financeAgent.js) para leerla y registrar
   el gasto. Mismo patrón que whatsappController.js: ack inmediato, todo lo
   demás corre después y la respuesta le llega al usuario como un mensaje
   aparte. */
import { timingSafeEqual } from "node:crypto";
import FinanceBotSession from "../models/FinanceBotSession.js";
import Expense from "../models/Expense.js";
import { sendTelegramMessage, downloadTelegramFile, financeBotConfigured } from "../utils/telegramFinanceBot.js";
import { uploadImageToCloudinary, cloudinaryConfigured } from "../utils/cloudinary.js";
import { extractExpenseFromReceipt } from "../services/financeAgent.js";
import { logServerError } from "./monitorController.js";

// Si tras esto la lectura sigue sin confianza, se registra de todos modos
// marcado para revisión manual -- mejor eso que dejar al usuario atorado
// contestando preguntas para siempre.
const MAX_ATTEMPTS = 3;

function isValidSecret(req) {
  const expected = process.env.TELEGRAM_FINANCE_WEBHOOK_SECRET;
  const provided = req.get("x-telegram-bot-api-secret-token") || "";
  if (!expected || !provided) return false;
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  try {
    return timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

const clearPendingReceipt = (session) => {
  session.pendingReceipt = { cloudinaryUrl: null, notes: [], attempts: 0 };
};

async function runExtraction(session, chatId, imageBuffer, mimeType) {
  session.pendingReceipt.attempts += 1;
  const attempt = session.pendingReceipt.attempts;

  let extracted;
  try {
    extracted = await extractExpenseFromReceipt(imageBuffer, mimeType, session.pendingReceipt.notes);
  } catch (err) {
    logServerError(err, "telegram finance: extractExpenseFromReceipt");
    await session.save();
    await sendTelegramMessage(chatId, "Tuve un problema leyendo la factura. Intenta de nuevo en un momento.");
    return;
  }

  if (extracted.needsReview && attempt < MAX_ATTEMPTS) {
    await session.save();
    await sendTelegramMessage(chatId, `🤔 ${extracted.doubt}`);
    return;
  }

  const expense = await Expense.create({
    category: extracted.category,
    description: extracted.description,
    amount: extracted.amount ?? 0,
    date: extracted.date,
    createdBy: `Telegram: ${session.telegramName || session.telegramUsername || chatId}`,
    source: "telegram",
    receiptUrl: session.pendingReceipt.cloudinaryUrl,
    // Todo lo que llega por este bot es una factura -- el IVA solo se llena
    // si el ticket lo traía desglosado (nunca se asume una tasa).
    hasFactura: true,
    facturaIva: extracted.iva,
  });

  const ivaNote = extracted.iva != null
    ? `\nIVA: $${extracted.iva.toLocaleString("es-MX")} (acreditable)`
    : "\n⚠️ No se vio el IVA desglosado — agrégalo en Finanzas para que se acredite.";
  const reviewNote = extracted.needsReview
    ? "\n⚠️ No quedó 100% claro — revísalo en Finanzas antes de darlo por bueno."
    : "";
  await sendTelegramMessage(
    chatId,
    `✅ Gasto registrado: $${expense.amount.toLocaleString("es-MX")} — ${expense.category}\n${expense.description}\n${expense.date}${ivaNote}${reviewNote}`
  );

  clearPendingReceipt(session);
  await session.save();
}

export const receiveTelegramFinanceWebhook = async (req, res) => {
  // Sin credenciales completas el feature no está activo -- se hace ack
  // para que Telegram no reintente indefinidamente.
  if (!financeBotConfigured() || !cloudinaryConfigured() || !process.env.TELEGRAM_FINANCE_WEBHOOK_SECRET) {
    return res.sendStatus(200);
  }
  if (!isValidSecret(req)) return res.sendStatus(401);
  res.sendStatus(200);

  try {
    const message = req.body?.message;
    if (!message?.chat?.id) return; // otros tipos de update (editado, canal, etc.)
    const chatId = String(message.chat.id);
    const text = typeof message.text === "string" ? message.text.trim() : "";
    const caption = typeof message.caption === "string" ? message.caption.trim() : "";

    let session = await FinanceBotSession.findOne({ chatId });
    if (!session) {
      session = new FinanceBotSession({
        chatId,
        telegramUsername: message.from?.username || null,
        telegramName: [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") || null,
      });
    }
    session.lastActivityAt = new Date();

    if (!session.authorized) {
      const code = process.env.TELEGRAM_FINANCE_ACCESS_CODE;
      if (code && text === code) {
        session.authorized = true;
        await session.save();
        await sendTelegramMessage(chatId, "✅ Acceso concedido. Mándame la foto de una factura o ticket cuando quieras registrarla en Finanzas.");
      } else {
        await session.save();
        await sendTelegramMessage(chatId, "👋 Soy el bot de Finanzas de Poke Palace. Escribe el código de acceso para empezar.");
      }
      return;
    }

    if (text === "/start") {
      await session.save();
      await sendTelegramMessage(chatId, "Mándame la foto de una factura o ticket y te pregunto lo que haga falta antes de registrarla en Finanzas.");
      return;
    }

    const photoSizes = message.photo;
    const isImageDocument = message.document?.mime_type?.startsWith("image/");
    const fileId = Array.isArray(photoSizes) && photoSizes.length > 0
      ? photoSizes[photoSizes.length - 1].file_id
      : isImageDocument ? message.document.file_id : null;

    if (fileId) {
      let downloaded;
      try {
        downloaded = await downloadTelegramFile(fileId);
      } catch (err) {
        logServerError(err, "telegram finance: downloadTelegramFile");
        await sendTelegramMessage(chatId, "No pude descargar esa foto, intenta mandarla de nuevo.");
        return;
      }

      let uploaded;
      try {
        uploaded = await uploadImageToCloudinary(downloaded.buffer, { mimeType: downloaded.mimeType });
      } catch (err) {
        logServerError(err, "telegram finance: uploadImageToCloudinary");
        await sendTelegramMessage(chatId, "Guardé la foto pero no pude subirla a Cloudinary. Intenta de nuevo en un momento.");
        return;
      }

      session.pendingReceipt = {
        cloudinaryUrl: uploaded.url,
        notes: caption ? [caption] : [],
        attempts: 0,
      };
      await session.save();

      if (caption) {
        await runExtraction(session, chatId, downloaded.buffer, downloaded.mimeType);
      } else {
        await sendTelegramMessage(chatId, "📸 Recibí la foto. ¿De qué es este gasto? (proveedor y para qué fue)");
      }
      return;
    }

    // Mensaje de texto -- solo tiene sentido como respuesta a una foto pendiente.
    if (!session.pendingReceipt?.cloudinaryUrl) {
      await session.save();
      await sendTelegramMessage(chatId, "Mándame primero la foto de la factura o el ticket 📸");
      return;
    }
    if (!text) {
      await session.save();
      return;
    }

    session.pendingReceipt.notes.push(text.slice(0, 300));

    let imageBuffer, mimeType;
    try {
      const r = await fetch(session.pendingReceipt.cloudinaryUrl);
      if (!r.ok) throw new Error(`fetch imagen falló: ${r.status}`);
      imageBuffer = Buffer.from(await r.arrayBuffer());
      mimeType = r.headers.get("content-type") || "image/jpeg";
    } catch (err) {
      logServerError(err, "telegram finance: refetch cloudinary image");
      clearPendingReceipt(session);
      await session.save();
      await sendTelegramMessage(chatId, "Tuve un problema releyendo la foto, intenta mandarla de nuevo desde cero.");
      return;
    }

    await runExtraction(session, chatId, imageBuffer, mimeType);
  } catch (err) {
    logServerError(err, "POST /api/telegram/finance-webhook");
  }
};
