import { RECEIPT_KINDS, RECEIPT_PAYMENT_METHODS } from "../models/Receipt.js";
import { startOfDateKey } from "./timeZone.js";

export function receiptListQuery(query = {}) {
  const filter = {};
  const status = query.status || "all";
  if (!["pending", "sent", "all"].includes(status)) return { error: "Estado inválido" };
  if (status === "pending") filter.sentToAccountantAt = null;
  if (status === "sent") filter.sentToAccountantAt = { $ne: null };
  for (const [field, choices] of [["kind", RECEIPT_KINDS], ["paymentMethod", RECEIPT_PAYMENT_METHODS]]) {
    if (!query[field]) continue;
    if (!choices.includes(query[field])) return { error: "Filtro inválido" };
    filter[field] = query[field];
  }
  for (const key of ["from", "to"]) {
    if (query[key] && (typeof query[key] !== "string" || !startOfDateKey(query[key]))) return { error: "Fecha inválida" };
  }
  if (query.from && query.to && query.from > query.to) return { error: "La fecha inicial debe ser anterior a la final" };
  if (query.from || query.to) filter.date = { ...(query.from && { $gte: query.from }), ...(query.to && { $lte: query.to }) };
  if (query.q) {
    if (typeof query.q !== "string" || query.q.length > 120) return { error: "La búsqueda admite hasta 120 caracteres" };
    const literal = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (literal) filter.$or = ["vendor", "note"].map((field) => ({ [field]: { $regex: literal, $options: "i" } }));
  }
  if (query.incomplete === "true") filter.amount = null;
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) return { error: "Página inválida" };
  return { filter, offset, limit: 50 };
}
