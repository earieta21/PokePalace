const round2 = (n) => Math.round(n * 100) / 100;

export const DIFFERENCE_EXPLANATION_THRESHOLD_PCT = 1;

/* Formulas exactas del Plan de 90 dias (Fase 1):
   efectivoEsperado = fondoInicial + ventasEfectivo - devolucionesEfectivo - retirosEfectivo
   diferenciaEfectivo = efectivoContado - efectivoEsperado
   porcentajeDiferencia = abs(diferenciaEfectivo) / max(ventasEfectivo, 1) x 100 */
export function computeCashCutTotals({ openingFloat, cashSales, returns = 0, withdrawals = 0, countedCash }) {
  const expectedCash = round2(openingFloat + cashSales - returns - withdrawals);
  const difference = round2(countedCash - expectedCash);
  const percentDifference = round2((Math.abs(difference) / Math.max(cashSales, 1)) * 100);
  return { expectedCash, difference, percentDifference };
}

export function requiresDifferenceExplanation(percentDifference) {
  return percentDifference > DIFFERENCE_EXPLANATION_THRESHOLD_PCT;
}