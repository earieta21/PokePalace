const MAX_BATCH_LINES = 100;
export { dateKeyInTimeZone } from "./timeZone.js";

export function normalizeRestockLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("Agrega al menos un artículo a la recepción");
  }
  if (lines.length > MAX_BATCH_LINES) {
    throw new Error(`Una recepción admite máximo ${MAX_BATCH_LINES} artículos`);
  }

  // cost es opcional — si no se captura, se conserva el costo unitario que
  // ya tenía el artículo (misma cantidad de la compra anterior). Si se
  // repite un artículo dentro del mismo lote, se suman las cantidades y se
  // conserva el último costo capturado para ese artículo.
  const totals = new Map();
  for (const line of lines) {
    const itemId = String(line?.itemId || "").trim();
    const amount = Number(line?.amount);
    if (!itemId || !Number.isFinite(amount) || amount <= 0) {
      throw new Error("Cada artículo necesita una cantidad mayor que cero");
    }
    const rawCost = line?.cost;
    const cost = rawCost === undefined || rawCost === null || rawCost === ""
      ? undefined
      : Number(rawCost);
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) {
      throw new Error("El costo capturado no es válido");
    }
    const previous = totals.get(itemId);
    totals.set(itemId, {
      amount: (previous?.amount || 0) + amount,
      cost: cost !== undefined ? cost : previous?.cost,
    });
  }

  return [...totals.entries()].map(([itemId, { amount, cost }]) => ({ itemId, amount, cost }));
}
