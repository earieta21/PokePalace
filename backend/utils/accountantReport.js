/* Paquete semanal para el contador -- cada lunes a partir de las 8:00 (hora
   Tijuana) manda por correo todos los comprobantes que se subieron antes de
   ese lunes y no se le habían mandado: fotos adjuntas, un resumen por forma de
   pago y un CSV para Excel.

   Mismo patrón que los gastos fijos y el recordatorio fiscal: se revisa cada
   hora y es idempotente. Cada comprobante se marca como enviado
   (Receipt.sentToAccountantAt) solo cuando Brevo aceptó el correo, así que
   nada se manda dos veces y nada se pierde si un envío falla: la siguiente
   revisión lo reintenta. */
import Receipt from "../models/Receipt.js";
import StoreSettings from "../models/StoreSettings.js";
import { sendEmailDetailed, emailConfigured } from "./notify.js";
import { cloudinaryResizedUrl } from "./cloudinary.js";
import { dateKeyInTimeZone, zonedParts } from "./timeZone.js";
import { mondayOf, weekEndKeyOf } from "./weeks.js";

export const RECEIPT_KIND_LABEL = {
  factura: "Factura (CFDI)",
  ticket:  "Ticket / nota",
  voucher: "Voucher de terminal",
  otro:    "Otro",
};

export const RECEIPT_PAYMENT_LABEL = {
  efectivo:      "Efectivo",
  tarjeta:       "Tarjeta",
  transferencia: "Transferencia",
  otro:          "Otro",
  sin_dato:      "Sin especificar",
};

const SEND_FROM_HOUR = 8;
// Un correo por cada 60 comprobantes; un restaurante chico rara vez llega.
const BATCH_SIZE = 60;
const MAX_BATCHES = 10;
// Brevo acepta hasta 20 MB por correo y 4 MB por adjunto; el base64 infla
// ~33 %, así que 11 MB de fotos quedan en ~15 MB con margen para el resto.
const ATTACHMENT_BUDGET_BYTES = 11 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 3.5 * 1024 * 1024;

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const roundMoney = (n) => Math.round(n * 100) / 100;
const fmtMXN = (n) => `$${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

const splitKey = (key) => key.split("-").map(Number);

export function dayLabel(key) {
  const [y, m, d] = splitKey(key);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

// "2026-11-02", "2026-11-08" → "del 2 al 8 de noviembre de 2026"
export function rangeLabel(fromKey, toKey) {
  const [fy, fm, fd] = splitKey(fromKey);
  const [ty, tm, td] = splitKey(toKey);
  if (fy === ty && fm === tm) return `del ${fd} al ${td} de ${MONTHS[tm - 1]} de ${ty}`;
  if (fy === ty) return `del ${fd} de ${MONTHS[fm - 1]} al ${td} de ${MONTHS[tm - 1]} de ${ty}`;
  return `del ${dayLabel(fromKey)} al ${dayLabel(toKey)}`;
}

/* Totales por forma de pago y por tipo. Los comprobantes sin monto cuentan
   en `count` pero no suman. */
export function summarizeReceipts(receipts) {
  const byPaymentMethod = {};
  const byKind = {};
  let total = 0;
  let withoutAmount = 0;

  for (const receipt of receipts) {
    const amount = Number.isFinite(receipt.amount) ? receipt.amount : null;
    const buckets = [
      [byPaymentMethod, receipt.paymentMethod || "sin_dato"],
      [byKind, receipt.kind || "otro"],
    ];
    for (const [bucket, key] of buckets) {
      bucket[key] ??= { count: 0, total: 0 };
      bucket[key].count += 1;
      if (amount !== null) bucket[key].total = roundMoney(bucket[key].total + amount);
    }
    if (amount === null) withoutAmount += 1;
    else total = roundMoney(total + amount);
  }

  return { count: receipts.length, total, withoutAmount, byPaymentMethod, byKind };
}

const slug = (value) => String(value || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  .slice(0, 30);

/* "01_2026-11-03_factura_efectivo_costco.jpg" -- el número inicial es el
   mismo que la columna # del correo y del CSV, para cruzarlos fácil. */
export function receiptFileName(receipt, index) {
  const parts = [
    String(index + 1).padStart(2, "0"),
    receipt.date,
    receipt.kind,
    receipt.paymentMethod || "sin-pago",
    slug(receipt.vendor),
  ].filter(Boolean);
  // Los documentos (PDF/XML de la factura) conservan su extensión.
  const extension = String(receipt.imageUrl || "").match(/\/raw\/upload\/.*\.(pdf|xml)(?:$|\?)/i)?.[1]?.toLowerCase() || "jpg";
  return `${parts.join("_")}.${extension}`;
}

const csvCell = (value) => {
  let text = value == null ? "" : String(value);
  // Texto capturado por el equipo: que Excel no lo ejecute como fórmula.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function buildReceiptsCsv(files) {
  const header = ["#", "Fecha", "Tipo", "Forma de pago", "Proveedor", "Monto", "Nota", "Archivo", "Enlace", "Subido por", "Origen"];
  const rows = files.map(({ receipt: r, name }, i) => [
    i + 1,
    r.date,
    RECEIPT_KIND_LABEL[r.kind] ?? r.kind,
    RECEIPT_PAYMENT_LABEL[r.paymentMethod || "sin_dato"],
    r.vendor || "",
    Number.isFinite(r.amount) ? r.amount : "",
    r.note || "",
    name,
    r.imageUrl,
    r.uploadedBy || "",
    r.source === "telegram" ? "Telegram" : "Portal",
  ]);
  // BOM para que Excel respete los acentos.
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function buildAccountantEmail({ files, periodLabel, partLabel = "", attachedNames = new Set() }) {
  const summary = summarizeReceipts(files.map((f) => f.receipt));
  const subject = `Poke Palace — comprobantes ${periodLabel}${partLabel}`;

  const methodRows = Object.keys(RECEIPT_PAYMENT_LABEL)
    .filter((key) => summary.byPaymentMethod[key])
    .map((key) => {
      const { count, total } = summary.byPaymentMethod[key];
      return `<tr><td style="padding:4px 0">${RECEIPT_PAYMENT_LABEL[key]}</td><td style="text-align:right">${count}</td><td style="text-align:right;font-family:monospace">${fmtMXN(total)}</td></tr>`;
    })
    .join("");

  const rows = files.map(({ receipt: r, name }, i) => `
      <tr style="border-top:1px solid #eee">
        <td style="padding:6px 4px;color:#888">${String(i + 1).padStart(2, "0")}</td>
        <td style="padding:6px 4px;white-space:nowrap">${escapeHtml(r.date)}</td>
        <td style="padding:6px 4px">${escapeHtml(RECEIPT_KIND_LABEL[r.kind] ?? r.kind)}</td>
        <td style="padding:6px 4px">${escapeHtml(RECEIPT_PAYMENT_LABEL[r.paymentMethod || "sin_dato"])}</td>
        <td style="padding:6px 4px">${escapeHtml(r.vendor || r.note || "—")}</td>
        <td style="padding:6px 4px;text-align:right;font-family:monospace;white-space:nowrap">${Number.isFinite(r.amount) ? fmtMXN(r.amount) : "—"}</td>
        <td style="padding:6px 4px;white-space:nowrap"><a href="${escapeHtml(r.imageUrl)}">${attachedNames.has(name) ? "adjunta · ver" : "ver archivo"}</a></td>
      </tr>`).join("");

  const attachedCount = files.filter((f) => attachedNames.has(f.name)).length;
  const linkedOnly = files.length - attachedCount;
  const attachmentNote = attachedCount === files.length
    ? "Todos los comprobantes van adjuntos a este correo."
    : attachedCount > 0
      ? `${attachedCount} comprobantes van adjuntos; los otros ${linkedOnly} no cupieron en el correo y están en su enlace "ver archivo".`
      : `Los comprobantes están en el enlace "ver archivo" de cada renglón.`;

  const html = `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:720px;margin:0 auto;color:#222">
  <div style="background:#4A7A5A;padding:20px 24px;border-radius:12px 12px 0 0">
    <h1 style="color:#fff;margin:0;font-size:20px">Poke Palace — comprobantes</h1>
    <p style="color:#d9ead9;margin:4px 0 0;font-size:13px">${escapeHtml(periodLabel)}${escapeHtml(partLabel)}</p>
  </div>
  <div style="padding:20px 24px;background:#fff;border:1px solid #e6e6e6;border-top:0;border-radius:0 0 12px 12px">
    <p style="font-size:14px;margin:0 0 14px">Hola, te compartimos ${summary.count} comprobante${summary.count !== 1 ? "s" : ""} (facturas, tickets y vouchers) de Poke Palace.</p>

    <table style="width:100%;max-width:380px;font-size:13px;border-collapse:collapse;margin-bottom:6px">
      <tr style="color:#888"><td>Forma de pago</td><td style="text-align:right">Cant.</td><td style="text-align:right">Monto</td></tr>
      ${methodRows}
      <tr style="border-top:1px solid #ddd;font-weight:700"><td style="padding:4px 0">Total</td><td style="text-align:right">${summary.count}</td><td style="text-align:right;font-family:monospace">${fmtMXN(summary.total)}</td></tr>
    </table>
    ${summary.withoutAmount > 0 ? `<p style="font-size:12px;color:#8a6d1f;margin:0 0 14px">${summary.withoutAmount} comprobante${summary.withoutAmount !== 1 ? "s" : ""} sin monto capturado — revisa la foto.</p>` : ""}

    <table style="width:100%;font-size:12.5px;border-collapse:collapse;margin-top:14px">
      <tr style="color:#888;text-align:left">
        <th style="padding:4px">#</th><th style="padding:4px">Fecha</th><th style="padding:4px">Tipo</th>
        <th style="padding:4px">Pago</th><th style="padding:4px">Proveedor / nota</th>
        <th style="padding:4px;text-align:right">Monto</th><th style="padding:4px">Foto</th>
      </tr>
      ${rows}
    </table>

    <p style="font-size:12px;color:#555;margin:16px 0 0">${escapeHtml(attachmentNote)} También va adjunto un CSV con el detalle para Excel; el número # coincide con el inicio del nombre de cada foto.</p>
    <p style="font-size:11px;color:#999;margin:14px 0 0">Correo automático del portal de Poke Palace. Los montos los captura el equipo al subir cada foto; el documento que vale es la foto.</p>
  </div>
</div>`;

  return { subject, html };
}

async function fetchReceiptImage(url) {
  const candidates = [...new Set([cloudinaryResizedUrl(url), url])];
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { signal: AbortSignal.timeout(20000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      // se intenta con la siguiente URL; si ninguna sirve, va solo el enlace
    }
  }
  return null;
}

async function collectImageAttachments(files) {
  const attachments = [];
  let used = 0;
  for (const { receipt, name } of files) {
    if (used >= ATTACHMENT_BUDGET_BYTES) break;
    const buffer = await fetchReceiptImage(receipt.imageUrl);
    if (!buffer || buffer.length > MAX_ATTACHMENT_BYTES || used + buffer.length > ATTACHMENT_BUDGET_BYTES) continue;
    used += buffer.length;
    attachments.push({ name, content: buffer.toString("base64") });
  }
  return attachments;
}

async function sendBatch(receipts, { to, periodLabel, partLabel }) {
  const files = receipts.map((receipt, i) => ({ receipt, name: receiptFileName(receipt, i) }));
  const csv = {
    name: `comprobantes_${dateKeyInTimeZone()}.csv`,
    content: Buffer.from(buildReceiptsCsv(files), "utf8").toString("base64"),
  };
  const images = await collectImageAttachments(files);

  const withImages = buildAccountantEmail({
    files, periodLabel, partLabel, attachedNames: new Set(images.map((a) => a.name)),
  });
  const first = await sendEmailDetailed({ to, ...withImages, attachments: [csv, ...images] });
  if (first.ok || images.length === 0) return first;

  // Si Brevo rechazó el correo con fotos (tamaño, formato…), se manda solo
  // con enlaces: mejor que el contador reciba algo esta semana.
  const linksOnly = buildAccountantEmail({ files, periodLabel, partLabel });
  return sendEmailDetailed({ to, ...linksOnly, attachments: [csv] });
}

let sendingNow = false;

/* Manda todo lo pendiente subido antes de `before`. Regresa
   { status, sent, emails, error? } con status: sent | nothing_pending |
   no_recipient | email_not_configured | failed | partial | busy; en failed y
   partial, `error` trae la respuesta de Brevo. */
export async function sendReceiptsToAccountant({ before = new Date(), periodLabel }) {
  // Se toma antes del primer await: un "Enviar ahora" y la revisión semanal
  // al mismo tiempo podrían mandar los mismos comprobantes dos veces.
  if (sendingNow) return { status: "busy", sent: 0, emails: 0 };
  sendingNow = true;

  try {
    const settings = await StoreSettings.findOne({ key: "main" }).select("accountantEmails").lean();
    const to = settings?.accountantEmails ?? [];
    if (to.length === 0) return { status: "no_recipient", sent: 0, emails: 0 };
    if (!emailConfigured()) return { status: "email_not_configured", sent: 0, emails: 0 };

    const pendingFilter = { sentToAccountantAt: null, createdAt: { $lt: before } };
    const pendingTotal = await Receipt.countDocuments(pendingFilter);
    if (pendingTotal === 0) return { status: "nothing_pending", sent: 0, emails: 0 };

    const parts = Math.min(Math.ceil(pendingTotal / BATCH_SIZE), MAX_BATCHES);
    let sent = 0;
    let emails = 0;
    for (let part = 1; part <= parts; part += 1) {
      const batch = await Receipt.find(pendingFilter)
        .sort({ date: 1, createdAt: 1 })
        .limit(BATCH_SIZE)
        .lean();
      if (batch.length === 0) break;

      const partLabel = parts > 1 ? ` (parte ${part} de ${parts})` : "";
      const result = await sendBatch(batch, { to, periodLabel, partLabel });
      if (!result.ok) return { status: sent > 0 ? "partial" : "failed", sent, emails, error: result.error };

      await Receipt.updateMany(
        { _id: { $in: batch.map((r) => r._id) }, sentToAccountantAt: null },
        { $set: { sentToAccountantAt: new Date() } }
      );
      sent += batch.length;
      emails += 1;
    }
    return { status: "sent", sent, emails };
  } finally {
    sendingNow = false;
  }
}

/* Fecha ("YYYY-MM-DD") del siguiente envío automático: el lunes de esta
   semana si todavía no se hace, si no el lunes que sigue. */
export function nextAccountantSendKey(lastSentWeek, now = new Date()) {
  const thisMonday = mondayOf(now);
  const weekKey = dateKeyInTimeZone(thisMonday);
  if (lastSentWeek !== weekKey) return weekKey;
  return dateKeyInTimeZone(mondayOf(new Date(thisMonday.getTime() + 8 * 86400000)));
}

/* Corre en el scheduler de server.js. Si el servidor estuvo apagado el lunes,
   lo manda en la primera revisión de esa semana. */
export async function checkAndSendWeeklyAccountantReport(now = new Date()) {
  const thisMonday = mondayOf(now);
  const weekKey = dateKeyInTimeZone(thisMonday);
  if (dateKeyInTimeZone(now) === weekKey && zonedParts(now).hour < SEND_FROM_HOUR) return null;

  const settings = await StoreSettings.findOne({ key: "main" })
    .select("accountantEmails lastAccountantReportWeek")
    .lean();
  if (settings?.lastAccountantReportWeek === weekKey) return null;
  // Sin correo del contador o sin Brevo no se marca la semana: en cuanto se
  // configure, la siguiente revisión manda lo pendiente.
  if (!settings?.accountantEmails?.length || !emailConfigured()) return null;

  // Cualquier instante de la semana pasada sirve para encontrar su lunes.
  const lastMonday = mondayOf(new Date(thisMonday.getTime() - 3 * 86400000));
  const periodLabel = `de la semana ${rangeLabel(dateKeyInTimeZone(lastMonday), weekEndKeyOf(lastMonday))}`;

  const result = await sendReceiptsToAccountant({ before: thisMonday, periodLabel });
  if (result.status === "sent" || result.status === "nothing_pending") {
    await StoreSettings.findOneAndUpdate(
      { key: "main" },
      { $set: { lastAccountantReportWeek: weekKey } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
  return { weekKey, ...result };
}
