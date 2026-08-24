import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeRestockLines } from "../utils/inventoryRestock.js";
import {
  dateKeyInTimeZone,
  dayRangeInTimeZone,
  startOfDateKey,
} from "../utils/timeZone.js";

test("la recepción agrupa artículos repetidos sin perder cantidades", () => {
  assert.deepEqual(normalizeRestockLines([
    { itemId: "rice", amount: 2 },
    { itemId: "soap", amount: 3 },
    { itemId: "rice", amount: 1.5 },
  ]), [
    { itemId: "rice", amount: 3.5, cost: undefined },
    { itemId: "soap", amount: 3, cost: undefined },
  ]);
});

test("la recepción rechaza cantidades no positivas", () => {
  assert.throws(
    () => normalizeRestockLines([{ itemId: "rice", amount: 0 }]),
    /mayor que cero/
  );
});

test("la recepción conserva el costo capturado por artículo", () => {
  assert.deepEqual(normalizeRestockLines([
    { itemId: "rice", amount: 2, cost: 18.5 },
    { itemId: "soap", amount: 3 },
  ]), [
    { itemId: "rice", amount: 2, cost: 18.5 },
    { itemId: "soap", amount: 3, cost: undefined },
  ]);
});

test("la recepción usa el último costo capturado si el artículo se repite", () => {
  assert.deepEqual(normalizeRestockLines([
    { itemId: "rice", amount: 2, cost: 18.5 },
    { itemId: "rice", amount: 1, cost: 20 },
  ]), [
    { itemId: "rice", amount: 3, cost: 20 },
  ]);

  assert.deepEqual(normalizeRestockLines([
    { itemId: "rice", amount: 2, cost: 18.5 },
    { itemId: "rice", amount: 1 },
  ]), [
    { itemId: "rice", amount: 3, cost: 18.5 },
  ]);
});

test("la recepción rechaza costos inválidos", () => {
  assert.throws(
    () => normalizeRestockLines([{ itemId: "rice", amount: 2, cost: -5 }]),
    /costo capturado no es válido/
  );
  assert.throws(
    () => normalizeRestockLines([{ itemId: "rice", amount: 2, cost: "abc" }]),
    /costo capturado no es válido/
  );
});

test("medianoche de Tijuana usa el desfase correcto en verano e invierno", () => {
  assert.equal(startOfDateKey("2026-07-15").toISOString(), "2026-07-15T07:00:00.000Z");
  assert.equal(startOfDateKey("2026-01-15").toISOString(), "2026-01-15T08:00:00.000Z");
  assert.equal(startOfDateKey("2026-02-31"), null);
});

test("el rango del cambio de horario de verano tiene 23 horas", () => {
  const range = dayRangeInTimeZone(new Date("2026-03-08T12:00:00.000Z"));
  assert.equal(range.start.toISOString(), "2026-03-08T08:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-03-09T07:00:00.000Z");
});

test("las ventas antes de medianoche local pertenecen al día anterior", () => {
  assert.equal(dateKeyInTimeZone(new Date("2026-07-15T06:59:59.000Z")), "2026-07-14");
});
