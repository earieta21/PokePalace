import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFiscalIncome } from "../services/fiscalIncome.js";
import { buildFiscalCSV } from "../../src/utils/fiscalExport.js";

const order = (id, total, paymentMethod, deliveryPlatform = null) => ({
  _id: id, total, paymentMethod, deliveryPlatform,
  createdAt: new Date("2026-10-01T07:30:00Z"),
});

function summary(orders) {
  const income = buildFiscalIncome(orders);
  return {
    month: "2026-10", ordenesCobradas: orders.length,
    ingresos: { ...income, conIva: income.total, base: income.total / 1.16 },
    gastos: { total: 20 }, iva: { trasladado: 10, acreditable: 2, neto: 8 },
    isr: { estimado: 1 }, totalEstimado: 9, notas: ["Estimación informativa"],
  };
}

test("cada venta se concilia una sola vez, incluido delivery propio en efectivo", () => {
  const orders = [
    order("cash", 116, "cash"), order("own", 58, "cash", "propio"),
    order("uber", 232, "delivery_app", "uber_eats"),
    order("didi", 116, "delivery_app", "didi_food"),
    order("rappi", 58, "delivery_app", "rappi"),
    order("old", 29, "delivery_app"), order("card", 116, "card_terminal"),
    order("online", 58, "online"), order("legacy", 29, null),
  ];
  const result = buildFiscalIncome(orders);
  assert.equal(result.total, 812);
  assert.deepEqual(result.grupos.map((g) => [g.id, g.total, g.ordenes]), [
    ["cash", 174, 2], ["delivery_app", 435, 4], ["other", 203, 3],
  ]);
  const ids = result.grupos.flatMap((g) => g.movimientos.map((m) => m.id));
  assert.equal(new Set(ids).size, orders.length);
  assert.equal(result.grupos.reduce((sum, g) => sum + g.total, 0), result.total);
  assert.equal(result.porPlataforma.reduce((sum, p) => sum + p.total, 0), 435);
  assert.deepEqual(result.porPlataforma.find((p) => p.id === "unknown"), { id: "unknown", total: 29, ordenes: 1 });
  assert.equal(result.porMetodo.pay_at_pickup, 29);
});

test("los importes se concilian en centavos y el mes sin ventas conserva los tres grupos", () => {
  const result = buildFiscalIncome([order("a", 0.1, "cash"), order("b", 0.2, "cash")]);
  assert.equal(result.total, 0.3);
  assert.equal(result.grupos[0].total, 0.3);
  const empty = buildFiscalIncome([]);
  assert.equal(empty.total, 0);
  assert.equal(empty.grupos.length, 3);
  assert.ok(empty.grupos.every((g) => g.total === 0 && g.ordenes === 0));
});

test("CSV completo y reportes parciales conservan el total y exportan cada venta en su grupo", () => {
  const data = summary([order("cash-id", 116, "cash"), order("app-id", 232, "delivery_app"), order("card-id", 58, "card_terminal")]);
  const complete = buildFiscalCSV(data);
  assert.ok(complete.some((r) => r[0] === "TOTAL GENERAL" && r[2] === "406.00"));
  assert.ok(complete.some((r) => r[0] === "Total estimado de impuestos"));
  const allDetails = [];
  for (const group of data.ingresos.grupos) {
    const partial = buildFiscalCSV(data, group.id);
    assert.ok(partial.some((r) => r[0] === "Alcance" && r[1].startsWith("Reporte parcial:")));
    assert.ok(partial.some((r) => r[0] === "TOTAL GENERAL" && r[2] === "406.00"));
    assert.equal(partial.some((r) => r[0] === "Total estimado de impuestos"), false);
    const details = partial.filter((r) => /-id$/.test(String(r[0])));
    assert.deepEqual(details.map((r) => r[0]), group.movimientos.map((m) => m.id));
    allDetails.push(...details.map((r) => r[0]));
  }
  assert.deepEqual(allDetails.sort(), ["app-id", "card-id", "cash-id"]);
  assert.ok(complete.some((r) => r[0] === "app-id" && r[3] === "Sin identificar"));
  assert.throws(() => buildFiscalCSV(data, "missing"), /inválido/);
});

test("CSV usa la fecha local del restaurante, sin cambiar de mes por UTC", () => {
  const data = summary([{ ...order("tz", 116, "cash"), createdAt: new Date("2026-11-01T06:30:00Z") }]);
  const row = buildFiscalCSV(data).find((r) => r[0] === "tz");
  assert.equal(row[1], "2026-10-31 23:30:00");
});
