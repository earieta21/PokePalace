/* Comprobantes para el contador: subir fotos de facturas/tickets/vouchers,
   listarlas, borrarlas mientras no se hayan enviado y configurar a quién se
   mandan cada semana (ver utils/accountantReport.js). */
import Receipt, { RECEIPT_KINDS, RECEIPT_PAYMENT_METHODS } from "../models/Receipt.js";
import Expense, { EXPENSE_CATEGORIES } from "../models/Expense.js";
import StoreSettings from "../models/StoreSettings.js";
import { uploadImageToCloudinary, deleteImageFromCloudinary, cloudinaryConfigured } from "../utils/cloudinary.js";
import { emailConfigured } from "../utils/notify.js";
import {
  sendReceiptsToAccountant, nextAccountantSendKey, summarizeReceipts,
  RECEIPT_KIND_LABEL, dayLabel,
} from "../utils/accountantReport.js";
import { dateKeyInTimeZone, startOfDateKey } from "../utils/timeZone.js";
import { logServerError } from "./monitorController.js";

const MAX_ACCOUNTANT_EMAILS = 3;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIST_LIMIT = 300;

// Se revisan los primeros bytes en vez de confiar en el Content-Type.
export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const cleanText = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/* La foto viaja como cuerpo binario, así que los datos van en el query
   string. Un parámetro repetido llega como arreglo y no pasa la validación. */
export function parseReceiptMeta(query, todayKey = dateKeyInTimeZone()) {
  const kind = query.kind ?? "ticket";
  if (!RECEIPT_KINDS.includes(kind)) return { error: "Tipo de comprobante inválido" };

  const paymentMethod = query.paymentMethod ? query.paymentMethod : null;
  if (paymentMethod !== null && !RECEIPT_PAYMENT_METHODS.includes(paymentMethod)) {
    return { error: "Forma de pago inválida" };
  }

  let amount = null;
  if (query.amount !== undefined && query.amount !== "") {
    amount = Number(query.amount);
    if (typeof query.amount !== "string" || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
      return { error: "El monto no es válido" };
    }
    amount = Math.round(amount * 100) / 100;
  }

  const date = query.date ?? todayKey;
  if (typeof date !== "string" || !startOfDateKey(date)) return { error: "La fecha no es válida" };
  if (date > todayKey) return { error: "La fecha no puede ser de un día que no ha llegado" };

  const registerExpense = query.registerExpense === "true";
  const category = query.category ?? "Otros";
  if (registerExpense) {
    if (amount === null || amount <= 0) return { error: "Para anotarlo como gasto escribe el monto" };
    if (!EXPENSE_CATEGORIES.includes(category)) return { error: "Categoría de gasto inválida" };
  }

  return {
    kind, paymentMethod, amount, date,
    vendor: cleanText(query.vendor, 120),
    note: cleanText(query.note, 300),
    registerExpense, category,
  };
}

const expenseDescription = (meta) =>
  ([meta.vendor, meta.note].filter(Boolean).join(" — ") || `${RECEIPT_KIND_LABEL[meta.kind]} ${meta.date}`).slice(0, 200);

/* POST /api/staff/receipts?kind=&paymentMethod=&amount=&date=&vendor=&note=&registerExpense=&category=
   Cuerpo: la foto (image/jpeg | image/png | image/webp). */
export const uploadReceipt = async (req, res) => {
  const meta = parseReceiptMeta(req.query);
  if (meta.error) return res.status(400).json({ message: meta.error });

  const mimeType = detectImageType(req.body);
  if (!mimeType) return res.status(400).json({ message: "Sube una foto en JPG, PNG o WEBP." });

  if (!cloudinaryConfigured()) {
    return res.status(503).json({ message: "El almacenamiento de fotos (Cloudinary) no está configurado en el servidor." });
  }

  let uploaded;
  try {
    uploaded = await uploadImageToCloudinary(req.body, { folder: "comprobantes", mimeType });
  } catch (err) {
    logServerError(err, "POST /api/staff/receipts: cloudinary");
    return res.status(502).json({ message: "No se pudo guardar la foto. Intenta de nuevo en un momento." });
  }

  const uploadedBy = req.staff?.name || "staff";
  const locationId = req.staff?.locationId || "tij-centro-01";
  let expense = null;
  try {
    if (meta.registerExpense) {
      expense = await Expense.create({
        category: meta.category,
        description: expenseDescription(meta),
        amount: meta.amount,
        date: meta.date,
        locationId,
        createdBy: uploadedBy,
        source: "comprobante",
        receiptUrl: uploaded.url,
        // El IVA no se adivina: si es factura se completa después en Finanzas.
        hasFactura: meta.kind === "factura",
      });
    }

    const receipt = await Receipt.create({
      kind: meta.kind,
      paymentMethod: meta.paymentMethod,
      amount: meta.amount,
      date: meta.date,
      vendor: meta.vendor,
      note: meta.note,
      imageUrl: uploaded.url,
      publicId: uploaded.publicId,
      source: "portal",
      locationId,
      uploadedBy,
      expenseId: expense?._id ?? null,
    });

    res.status(201).json({ receipt, expense });
  } catch (err) {
    // Que no quede ni un gasto ni una foto huérfana de un registro a medias.
    if (expense) await Expense.deleteOne({ _id: expense._id }).catch(() => {});
    await deleteImageFromCloudinary(uploaded.publicId).catch(() => {});
    logServerError(err, "POST /api/staff/receipts");
    res.status(500).json({ message: "No se pudo registrar el comprobante." });
  }
};

/* GET /api/staff/receipts?status=pending|sent|all */
export const listReceipts = async (req, res) => {
  try {
    const status = ["pending", "sent", "all"].includes(req.query.status) ? req.query.status : "all";
    const filter = {};
    if (status === "pending") filter.sentToAccountantAt = null;
    if (status === "sent") filter.sentToAccountantAt = { $ne: null };

    const [receipts, pending] = await Promise.all([
      Receipt.find(filter).sort({ date: -1, createdAt: -1 }).limit(LIST_LIMIT).lean(),
      Receipt.find({ sentToAccountantAt: null }).select("amount paymentMethod kind").lean(),
    ]);
    res.json({ receipts, pendingSummary: summarizeReceipts(pending) });
  } catch (err) {
    logServerError(err, "GET /api/staff/receipts");
    res.status(500).json({ message: "Error al obtener comprobantes" });
  }
};

/* DELETE /api/staff/receipts/:id — solo mientras siga pendiente de envío. */
export const deleteReceipt = async (req, res) => {
  try {
    const receipt = await Receipt.findById(req.params.id).lean();
    if (!receipt) return res.status(404).json({ message: "Comprobante no encontrado" });
    if (receipt.sentToAccountantAt) {
      return res.status(409).json({ message: "Este comprobante ya se le envió al contador; ya no se puede borrar." });
    }

    // Condicionado a que siga pendiente por si el envío semanal lo tomó
    // justo entre la lectura y el borrado.
    const { deletedCount } = await Receipt.deleteOne({ _id: receipt._id, sentToAccountantAt: null });
    if (deletedCount === 0) {
      return res.status(409).json({ message: "Este comprobante se acaba de enviar al contador; ya no se puede borrar." });
    }

    let expenseRemoved = false;
    if (receipt.expenseId) {
      // Solo el gasto que nació de este comprobante; uno de Telegram se queda.
      const result = await Expense.deleteOne({ _id: receipt.expenseId, source: "comprobante" });
      expenseRemoved = result.deletedCount > 0;
    }
    if (receipt.source === "portal" && receipt.publicId) {
      deleteImageFromCloudinary(receipt.publicId)
        .catch((err) => logServerError(err, "DELETE /api/staff/receipts: cloudinary"));
    }

    res.json({ ok: true, expenseRemoved });
  } catch (err) {
    if (err?.name === "CastError") return res.status(404).json({ message: "Comprobante no encontrado" });
    logServerError(err, "DELETE /api/staff/receipts/:id");
    res.status(500).json({ message: "Error al borrar el comprobante" });
  }
};

/* GET /api/staff/receipts/settings */
export const getReceiptSettings = async (req, res) => {
  try {
    const settings = await StoreSettings.findOne({ key: "main" })
      .select("accountantEmails lastAccountantReportWeek")
      .lean();
    res.json({
      accountantEmails: settings?.accountantEmails ?? [],
      lastSentWeek: settings?.lastAccountantReportWeek ?? null,
      nextSendDate: nextAccountantSendKey(settings?.lastAccountantReportWeek ?? null),
      today: dateKeyInTimeZone(),
      emailConfigured: emailConfigured(),
      storageConfigured: cloudinaryConfigured(),
    });
  } catch (err) {
    logServerError(err, "GET /api/staff/receipts/settings");
    res.status(500).json({ message: "Error al obtener la configuración" });
  }
};

/* PUT /api/staff/receipts/settings  { accountantEmails: ["a@b.com"] | "a@b.com, c@d.com" } */
export const updateReceiptSettings = async (req, res) => {
  const raw = req.body?.accountantEmails;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;\s]+/) : null;
  if (!list) return res.status(400).json({ message: "Escribe el correo del contador" });

  const emails = [...new Set(
    list.filter((e) => typeof e === "string").map((e) => e.trim().toLowerCase()).filter(Boolean)
  )];
  if (emails.length > MAX_ACCOUNTANT_EMAILS) {
    return res.status(400).json({ message: `Máximo ${MAX_ACCOUNTANT_EMAILS} correos` });
  }
  if (emails.some((e) => e.length > 120 || !EMAIL_PATTERN.test(e))) {
    return res.status(400).json({ message: "Revisa los correos: alguno no es válido" });
  }

  try {
    await StoreSettings.findOneAndUpdate(
      { key: "main" },
      { $set: { accountantEmails: emails } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ accountantEmails: emails });
  } catch (err) {
    logServerError(err, "PUT /api/staff/receipts/settings");
    res.status(500).json({ message: "No se pudo guardar el correo" });
  }
};

/* POST /api/staff/receipts/send-now — manda ya todo lo pendiente, sin
   esperar al lunes (no cambia el envío automático de la semana). */
export const sendReceiptsNow = async (req, res) => {
  try {
    const result = await sendReceiptsToAccountant({
      before: new Date(),
      periodLabel: `pendientes al ${dayLabel(dateKeyInTimeZone())}`,
    });

    switch (result.status) {
      case "sent":
        return res.json({ ...result, message: `Se enviaron ${result.sent} comprobante${result.sent !== 1 ? "s" : ""} al contador.` });
      case "nothing_pending":
        return res.json({ ...result, message: "No hay comprobantes pendientes de enviar." });
      case "no_recipient":
        return res.status(400).json({ ...result, message: "Primero guarda el correo del contador." });
      case "email_not_configured":
        return res.status(503).json({ ...result, message: "El envío de correos (Brevo) no está configurado en el servidor." });
      case "busy":
        return res.status(409).json({ ...result, message: "Ya se está enviando un paquete; espera un momento." });
      case "partial":
        return res.status(502).json({ ...result, message: `Se enviaron ${result.sent}, pero falló una parte. Lo demás se reintenta en el próximo envío.` });
      default:
        return res.status(502).json({ ...result, message: "No se pudo enviar el correo. Intenta de nuevo más tarde." });
    }
  } catch (err) {
    logServerError(err, "POST /api/staff/receipts/send-now");
    res.status(500).json({ message: "Error al enviar los comprobantes" });
  }
};
