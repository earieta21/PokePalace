import InventoryMovement from "../models/InventoryMovement.js";

/* Misma regla que ya usa el pipeline de restoreInventoryForOrder en
   staffOrderController.js: si hay orderDeductions para esta orden, se suma
   su cantidad exacta; si no, compatibilidad con pedidos deducidos antes de
   que existiera ese ledger (deductedOrderIds legado) siempre quitó 1.
   Función pura para que el pipeline (Mongo) y este cálculo en JS no puedan
   desincronizarse sin que una prueba unitaria lo detecte. */
export function restoreAmountForOrder(doc, orderId) {
  const matching = (doc?.orderDeductions || []).filter((d) => String(d.orderId) === String(orderId));
  if (matching.length > 0) {
    return matching.reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);
  }
  const legacyIds = (doc?.deductedOrderIds || []).map(String);
  return legacyIds.includes(String(orderId)) ? 1 : 0;
}

/* Registra un movimiento de cantidad de inventario. Nunca lanza: si truena
   por E11000 (idempotencyKey duplicada) es un reintento ya registrado, se
   trata como éxito silencioso -- cualquier otra falla se loguea pero no debe
   tumbar la operación de negocio (restock/venta/cancelación) que la disparó. */
export async function recordInventoryMovement({
  itemId, itemName, type, delta, qtyBefore, qtyAfter,
  actorId = null, actorName = "system",
  reference = null, referenceType = "manual", reason = "",
  locationId = null, idempotencyKey = null,
}) {
  try {
    return await InventoryMovement.create({
      itemId, itemName, type, delta, qtyBefore, qtyAfter,
      actorId, actorName, reference, referenceType, reason, locationId, idempotencyKey,
    });
  } catch (err) {
    if (err?.code === 11000) return null;
    console.error("recordInventoryMovement error:", err.message);
    return null;
  }
}