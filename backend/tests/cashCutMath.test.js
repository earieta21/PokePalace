import { test } from "node:test";
import assert from "node:assert/strict";

import { computeCashCutTotals, requiresDifferenceExplanation, DIFFERENCE_EXPLANATION_THRESHOLD_PCT } from "../utils/cashCutMath.js";

test("efectivo esperado resta devoluciones y retiros del fondo mas ventas", () => {
  const { expectedCash } = computeCashCutTotals({
    openingFloat: 500, cashSales: 1000, returns: 50, withdrawals: 100, countedCash: 1350,
  });
  assert.equal(expectedCash, 1350); // 500 + 1000 - 50 - 100
});

test("diferencia es efectivo contado menos efectivo esperado", () => {
  const { expectedCash, difference } = computeCashCutTotals({
    openingFloat: 500, cashSales: 1000, returns: 0, withdrawals: 0, countedCash: 1450,
  });
  assert.equal(expectedCash, 1500);
  assert.equal(difference, -50); // faltante
});

test("porcentaje de diferencia usa max(ventasEfectivo, 1) para evitar division entre cero", () => {
  const { percentDifference } = computeCashCutTotals({
    openingFloat: 500, cashSales: 0, returns: 0, withdrawals: 0, countedCash: 510,
  });
  // diferencia = 10, ventasEfectivo = 0 -> denominador = max(0,1) = 1
  assert.equal(percentDifference, 1000);
});

test("porcentaje de diferencia se calcula sobre las ventas en efectivo reales", () => {
  const { difference, percentDifference } = computeCashCutTotals({
    openingFloat: 500, cashSales: 1000, returns: 0, withdrawals: 0, countedCash: 1520,
  });
  assert.equal(difference, 20);
  assert.equal(percentDifference, 2); // 20 / 1000 * 100
});

test("requiresDifferenceExplanation exige motivo solo arriba del umbral de 1%", () => {
  assert.equal(DIFFERENCE_EXPLANATION_THRESHOLD_PCT, 1);
  assert.equal(requiresDifferenceExplanation(1), false);
  assert.equal(requiresDifferenceExplanation(1.01), true);
  assert.equal(requiresDifferenceExplanation(0), false);
});