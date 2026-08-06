const round2 = (n) => Math.round(n * 100) / 100;

/* Costo promedio ponderado al recibir mercancía (Fase 2):
   se conserva el costo anterior, se registra el costo de la compra nueva,
   y el costo resultante es el promedio ponderado por cantidad -- nunca se
   sobreescribe silenciosamente con el precio más reciente. */
export function computeWeightedAverageCost({ qtyBefore, costBefore, qtyReceived, costReceived }) {
  const priorQty = Math.max(0, Number(qtyBefore) || 0);
  const priorCost = Math.max(0, Number(costBefore) || 0);
  const receivedQty = Math.max(0, Number(qtyReceived) || 0);
  const receivedCost = Math.max(0, Number(costReceived) || 0);

  const totalQty = priorQty + receivedQty;
  if (totalQty <= 0) return round2(receivedCost);

  const weighted = (priorQty * priorCost + receivedQty * receivedCost) / totalQty;
  return round2(weighted);
}