import { test } from "node:test";
import assert from "node:assert/strict";
import Order from "../models/Order.js";
import Expense from "../models/Expense.js";
import { computeFiscalSummary } from "../services/fiscalCalc.js";

test("el resumen fiscal mantiene efectivo y apps en el total y en las estimaciones", async (t) => {
  const orders = [
    { _id: "cash", total: 116, paymentMethod: "cash" },
    { _id: "app", total: 232, paymentMethod: "delivery_app", deliveryPlatform: "uber_eats" },
    { _id: "card", total: 116, paymentMethod: "card_terminal" },
  ].map((o) => ({ ...o, createdAt: new Date("2026-10-15T20:00:00Z") }));
  t.mock.method(Order, "find", (filter) => {
    assert.equal(filter.paymentStatus, "paid");
    assert.deepEqual(filter.status, { $ne: "cancelled" });
    assert.equal(filter.paymentMethod, undefined);
    assert.equal(filter.createdAt.$gte.toISOString(), "2026-10-01T07:00:00.000Z");
    assert.equal(filter.createdAt.$lt.toISOString(), "2026-11-01T07:00:00.000Z");
    const query = { select: () => query, sort: () => query, lean: async () => orders };
    return query;
  });
  t.mock.method(Expense, "find", () => ({ lean: async () => [
    { amount: 116, hasFactura: true, facturaIva: 16 },
  ] }));
  const data = await computeFiscalSummary(2026, 10);
  assert.equal(data.ordenesCobradas, 3);
  assert.equal(data.ingresos.conIva, 464);
  assert.equal(data.ingresos.base, 400);
  assert.equal(data.iva.trasladado, 64);
  assert.equal(data.iva.acreditable, 16);
  assert.equal(data.iva.neto, 48);
  assert.equal(data.isr.estimado, 4);
  assert.equal(data.totalEstimado, 52);
  assert.equal(data.ingresos.grupos.reduce((sum, g) => sum + g.total, 0), 464);
});
