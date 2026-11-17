/* Comprobantes para el contador: subir fotos de facturas/tickets/vouchers,
   listarlas, borrarlas mientras no se hayan enviado y configurar a quién se
   mandan cada semana (ver utils/accountantReport.js). */
import Receipt, { RECEIPT_KINDS, RECEIPT_PAYMENT_METHODS } from "../models/Receipt.js";
import ReceiptDelivery from "../models/ReceiptDelivery.js";
import { randomUUID } from "node:crypto";
import { receiptListQuery } from "../utils/receiptQueries.js";
import { parseReceiptFiles, receiptDocuments, RECEIPT_BUNDLE_TYPE } from "../utils/receiptDocuments.js";
export { detectImageType } from "../utils/receiptDocuments.js";
import Expense, { EXPENSE_CATEGORIES } from "../models/Expense.js";
import StoreSettings from "../models/StoreSettings.js";
import { uploadImageToCloudinary, deleteImageFromCloudinary, cloudinaryConfigured } from "../utils/cloudinary.js";
import { emailConfigured, explainEmailError } from "../utils/notify.js";
import {
  sendReceiptsToAccountant, nextAccountantSendKey, summarizeReceipts,
  RECEIPT_KIND_LABEL, dayLabel,
} from "../utils/accountantReport.js";
import { dateKeyInTimeZone, startOfDateKey } from "../utils/timeZone.js";
import { logServerError } from "./monitorController.js";

const MAX_ACCOUNTANT_EMAILS = 3;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Se revisan los primeros bytes en vez de confiar en el Content-Type.

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
    if (kind === "voucher") return { error: "Un voucher de ventas no se puede registrar como gasto" };
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

const validId = (id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
const ownsExpense = (receipt, expense) => expense?.source === "comprobante" && receipt.source === "portal" && receipt.expenseMode !== "existing";
const pendingClaim = { sentToAccountantAt: null, processing: null };

async function linkedExpense(id, meta, locationId) {
  if (!validId(id)) throw Object.assign(new Error("Elige un gasto válido"), { status: 400 });
  const expense = await Expense.findOne({ _id: id, locationId }).lean();
  if (!expense) throw Object.assign(new Error("Gasto no encontrado en esta sucursal"), { status: 404 });
  if (meta.kind === "voucher" || meta.amount !== expense.amount || meta.date !== expense.date) {
    throw Object.assign(new Error("El monto y la fecha deben coincidir con el gasto. Un voucher no se vincula a gastos."), { status: 400 });
  }
  return expense;
}

export const getReceiptExpenseOptions = async (req, res) => {
  if (typeof req.query.date !== "string" || !startOfDateKey(req.query.date)) return res.status(400).json({ message: "Fecha inválida" });
  try {
    const expenses = await Expense.find({ date: req.query.date, locationId: req.staff?.locationId || "tij-centro-01" })
      .sort({ createdAt: -1 }).select("description amount date category source").limit(100).lean();
    res.json({ expenses });
  } catch (err) {
    logServerError(err, "GET receipts/expense-options");
    res.status(500).json({ message: "No se pudieron consultar los gastos" });
  }
};

export const getReceiptDeliveries = async (req, res) => {
  try {
    const offset = Number(req.query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return res.status(400).json({ message: "Página inválida" });
    const deliveries = await ReceiptDelivery.find().sort({ createdAt: -1, _id: -1 }).skip(offset).limit(21).lean();
    res.json({ deliveries: deliveries.slice(0, 20), hasMore: deliveries.length > 20 });
  } catch (err) {
    logServerError(err, "GET receipts/deliveries");
    res.status(500).json({ message: "No se pudo consultar el historial de envíos" });
  }
};

/* POST /api/staff/receipts?kind=&paymentMethod=&amount=&date=&vendor=&note=&registerExpense=&category=
   Cuerpo: la foto (image/jpeg | image/png | image/webp). */
export const uploadReceipt = async (req, res) => {
  const meta = parseReceiptMeta(req.query);
  if (meta.error) return res.status(400).json({ message: meta.error });

  const locationId = req.staff?.locationId || "tij-centro-01";
  let existingExpense = null;
  try {
    if (req.query.expenseId) {
      if (meta.registerExpense) return res.status(400).json({ message: "Elige crear un gasto o vincular uno existente" });
      existingExpense = await linkedExpense(req.query.expenseId, meta, locationId);
    }
    if (req.query.allowDuplicate !== "true" && meta.amount !== null) {
      const vendorPattern = meta.vendor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const sameReceipt = await Receipt.exists({ date: meta.date, amount: meta.amount, kind: meta.kind, vendor: { $regex: `^${vendorPattern}$`, $options: "i" }, locationId });
      const sameExpense = meta.registerExpense && await Expense.exists({ date: meta.date, amount: meta.amount, locationId });
      if (sameReceipt || sameExpense) return res.status(409).json({
        code: "POSSIBLE_DUPLICATE", message: sameExpense
          ? "Ya hay un gasto con esta fecha y monto. Vincúlalo o confirma que es otra compra."
          : "Ya hay un comprobante con estos datos. Confirma que es un documento diferente.",
      });
    }
  } catch (err) {
    logServerError(err, "POST receipts: linkage");
    return res.status(err.status || 500).json({ message: err.status ? err.message : "No se pudo revisar la vinculación" });
  }

  let files;
  try { files = parseReceiptFiles(req.body, Boolean(req.is(RECEIPT_BUNDLE_TYPE))); }
  catch (err) { return res.status(400).json({ message: err.message }); }

  if (!cloudinaryConfigured()) {
    return res.status(503).json({ message: "El almacenamiento de fotos (Cloudinary) no está configurado en el servidor." });
  }

  const documents = [];
  try {
    for (const file of files) {
      const asset = await uploadImageToCloudinary(file.buffer, { folder: "comprobantes", mimeType: file.mimeType });
      documents.push({ ...asset, mimeType: file.mimeType, name: file.name });
    }
  } catch (err) {
    await Promise.allSettled(documents.map((doc) => deleteImageFromCloudinary(doc.publicId, doc.resourceType)));
    logServerError(err, "POST /api/staff/receipts: cloudinary");
    return res.status(502).json({ message: "No se pudo guardar la foto. Intenta de nuevo en un momento." });
  }
  const uploaded = documents[0];

  const uploadedBy = req.staff?.name || "staff";
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
      documents,
      publicId: uploaded.publicId,
      source: "portal",
      locationId,
      uploadedBy,
      expenseId: expense?._id ?? existingExpense?._id ?? null,
      expenseMode: expense ? "created" : existingExpense ? "existing" : null,
    });

    res.status(201).json({ receipt, expense });
  } catch (err) {
    // Que no quede ni un gasto ni una foto huérfana de un registro a medias.
    if (expense) await Expense.deleteOne({ _id: expense._id }).catch(() => {});
    await Promise.allSettled(documents.map((doc) => deleteImageFromCloudinary(doc.publicId, doc.resourceType)));
    logServerError(err, "POST /api/staff/receipts");
    res.status(500).json({ message: "No se pudo registrar el comprobante." });
  }
};

/* GET /api/staff/receipts?status=pending|sent|all */
export const listReceipts = async (req, res) => {
  const parsed = receiptListQuery(req.query);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  try {
    const { filter, offset, limit } = parsed;
    const [rows, pending, total] = await Promise.all([
      Receipt.find(filter).sort({ date: -1, createdAt: -1, _id: -1 }).skip(offset).limit(limit).lean(),
      Receipt.find({ sentToAccountantAt: null }).select("amount paymentMethod kind").lean(),
      Receipt.countDocuments(filter),
    ]);
    res.json({ receipts: rows, total, hasMore: offset + rows.length < total, pendingSummary: summarizeReceipts(pending) });
  } catch (err) {
    logServerError(err, "GET /api/staff/receipts");
    res.status(500).json({ message: "Error al obtener comprobantes" });
  }
};

/* A pending receipt owns only the expense created with it. Existing expenses
   are linked without rewriting inventory/payroll/manual records. */
export const updateReceipt = async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ message: "Comprobante no encontrado" });
  const meta = parseReceiptMeta(req.body || {});
  if (meta.error) return res.status(400).json({ message: meta.error });
  if (!Number.isSafeInteger(req.body.revision) || req.body.revision < 0) return res.status(400).json({ message: "Actualiza el comprobante antes de editarlo" });
  const token = randomUUID();
  let receipt;
  let expense;
  let expenseChanged = false;
  let expenseAfter;
  try {
    const version = req.body.revision === 0 ? { $in: [0, null] } : req.body.revision;
    receipt = await Receipt.findOneAndUpdate({ _id: req.params.id, ...pendingClaim, revision: version }, { $set: { processing: token } }, { new: true }).lean();
    if (!receipt) return res.status(409).json({ message: "El comprobante cambió, ya fue enviado o está en proceso. Actualiza la lista." });
    expense = receipt.expenseId ? await Expense.findById(receipt.expenseId).lean() : null;
    const owner = ownsExpense(receipt, expense);
    const changes = Object.fromEntries(["kind", "paymentMethod", "amount", "date", "vendor", "note"].map((key) => [key, meta[key]]));
    if (owner) {
      if (!(meta.amount > 0) || meta.kind === "voucher") return res.status(400).json({ message: "El gasto asociado requiere un monto positivo y un comprobante de compra" });
      if (req.body.expenseId !== undefined && req.body.expenseId !== String(expense._id)) return res.status(400).json({ message: "Este comprobante ya creó un gasto; edita sus datos sin vincular otro" });
      expenseAfter = await Expense.findOneAndUpdate({ _id: expense._id, updatedAt: expense.updatedAt }, { $set: {
        amount: meta.amount, date: meta.date, description: expenseDescription(meta),
        hasFactura: meta.kind === "factura", ...(meta.kind !== "factura" && { facturaIva: null }),
      } }, { new: true, runValidators: true }).lean();
      if (!expenseAfter) return res.status(409).json({ message: "El gasto cambió en Finanzas. Actualiza e intenta de nuevo." });
      expenseChanged = true;
    } else {
      const target = req.body.expenseId === undefined ? receipt.expenseId?.toString() : req.body.expenseId;
      if (target) await linkedExpense(target, meta, receipt.locationId);
      changes.expenseId = target || null;
      changes.expenseMode = target ? "existing" : null;
    }
    const updated = await Receipt.findOneAndUpdate({ _id: receipt._id, processing: token }, { $set: { ...changes, processing: null }, $inc: { revision: 1 } }, { new: true, runValidators: true }).lean();
    if (!updated) throw new Error("Se perdió el bloqueo del comprobante");
    res.json({ receipt: { ...updated, processing: null } });
  } catch (err) {
    if (expenseChanged) await Expense.updateOne({ _id: expense._id, updatedAt: expenseAfter.updatedAt }, { $set: {
      amount: expense.amount, date: expense.date, description: expense.description,
      hasFactura: expense.hasFactura, facturaIva: expense.facturaIva,
    } }).catch((rollbackError) => logServerError(rollbackError, "PATCH receipts: rollback expense"));
    logServerError(err, "PATCH receipts/:id");
    res.status(err.status || 500).json({ message: err.status ? err.message : "No se pudo actualizar el comprobante" });
  } finally {
    if (receipt) await Receipt.updateOne({ _id: receipt._id, processing: token }, { $set: { processing: null } }).catch((err) => logServerError(err, "PATCH receipts: release"));
  }
};

/* DELETE /api/staff/receipts/:id — solo mientras siga pendiente de envío. */
export const deleteReceipt = async (req, res) => {
  const token = randomUUID();
  let receipt;
  try {
    const exists = await Receipt.findById(req.params.id).lean();
    if (!exists) return res.status(404).json({ message: "Comprobante no encontrado" });
    receipt = await Receipt.findOneAndUpdate({ _id: exists._id, ...pendingClaim }, { $set: { processing: token } }, { new: true }).lean();
    if (!receipt) return res.status(409).json({ message: "Este comprobante ya se envió o está en proceso; no se puede borrar." });

    // Condicionado a que siga pendiente por si el envío semanal lo tomó
    // justo entre la lectura y el borrado.
    const { deletedCount } = await Receipt.deleteOne({ _id: receipt._id, sentToAccountantAt: null, processing: token });
    if (deletedCount === 0) {
      return res.status(409).json({ message: "Este comprobante se acaba de enviar al contador; ya no se puede borrar." });
    }

    let expenseRemoved = false;
    let preserveFiles = false;
    if (receipt.expenseId && receipt.expenseMode !== "existing" && receipt.source === "portal") {
      // Solo el gasto que nació de este comprobante; uno de Telegram se queda.
      const shared = await Receipt.exists({ expenseId: receipt.expenseId });
      preserveFiles = Boolean(shared);
      const result = shared ? { deletedCount: 0 } : await Expense.deleteOne({ _id: receipt.expenseId, source: "comprobante" });
      expenseRemoved = result.deletedCount > 0;
    }
    if (receipt.source === "portal" && receipt.publicId && !preserveFiles) {
      Promise.all(receiptDocuments(receipt).map((doc) => deleteImageFromCloudinary(doc.publicId, doc.resourceType)))
        .catch((err) => logServerError(err, "DELETE /api/staff/receipts: cloudinary"));
    }

    res.json({ ok: true, expenseRemoved });
  } catch (err) {
    if (err?.name === "CastError") return res.status(404).json({ message: "Comprobante no encontrado" });
    logServerError(err, "DELETE /api/staff/receipts/:id");
    res.status(500).json({ message: "Error al borrar el comprobante" });
  } finally {
    if (receipt) await Receipt.updateOne({ _id: receipt._id, processing: token }, { $set: { processing: null } }).catch((err) => logServerError(err, "DELETE receipts: release"));
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
        logServerError(new Error(`Brevo: ${result.error}`), "POST /api/staff/receipts/send-now");
        return res.status(502).json({ ...result, message: `Se enviaron ${result.sent}, pero falló una parte. ${explainEmailError(result.error)}` });
      default:
        logServerError(new Error(`Brevo: ${result.error}`), "POST /api/staff/receipts/send-now");
        return res.status(502).json({ ...result, message: `No se pudo enviar el correo. ${explainEmailError(result.error)}` });
    }
  } catch (err) {
    logServerError(err, "POST /api/staff/receipts/send-now");
    res.status(500).json({ message: "Error al enviar los comprobantes" });
  }
};
