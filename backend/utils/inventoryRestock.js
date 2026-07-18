const MAX_BATCH_LINES = 100;
export { dateKeyInTimeZone } from "./timeZone.js";

export function normalizeRestockLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("Agrega al menos un artículo a la recepción");
  }
  if (lines.length > MAX_BATCH_LINES) {
    throw new Error(`Una recepción admite máximo ${MAX_BATCH_LINES} artículos`);
  }

  const totals = new Map();
  for (const line of lines) {
    const itemId = String(line?.itemId || "").trim();
    const amount = Number(line?.amount);
    if (!itemId || !Number.isFinite(amount) || amount <= 0) {
      throw new Error("Cada artículo necesita una cantidad mayor que cero");
    }
    totals.set(itemId, (totals.get(itemId) || 0) + amount);
  }

  return [...totals.entries()].map(([itemId, amount]) => ({ itemId, amount }));
}
