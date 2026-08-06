import { test } from "node:test";
import assert from "node:assert/strict";

import { diffFields } from "../utils/auditLog.js";
import { restoreAmountForOrder } from "../utils/inventoryLedger.js";

test("diffFields solo regresa los campos que de verdad cambiaron", () => {
  const before = { item: "Salmón", cost: 10, qty: 5, supplier: "" };
  const after  = { item: "Salmón", cost: 15, qty: 5, supplier: "Ocean Fresh" };

  const changes = diffFields(before, after, ["item", "cost", "qty", "supplier"]);
  assert.deepEqual(changes.map((c) => c.field).sort(), ["cost", "supplier"]);

  const costChange = changes.find((c) => c.field === "cost");
  assert.equal(costChange.oldValue, 10);
  assert.equal(costChange.newValue, 15);
});

test("diffFields ignora campos fuera de la lista aunque hayan cambiado", () => {
  const before = { qty: 5, cost: 10 };
  const after  = { qty: 9, cost: 20 };
  assert.deepEqual(diffFields(before, after, ["cost"]), [
    { field: "cost", oldValue: 10, newValue: 20 },
  ]);
});

test("diffFields no reporta cambio cuando ambos valores son ausentes/null", () => {
  const before = { supplier: undefined };
  const after  = { supplier: null };
  assert.deepEqual(diffFields(before, after, ["supplier"]), []);
});

test("restoreAmountForOrder suma las cantidades exactas del ledger de la orden", () => {
  const doc = {
    orderDeductions: [
      { orderId: "order-1", quantity: 2 },
      { orderId: "order-2", quantity: 5 },
      { orderId: "order-1", quantity: 1 },
    ],
  };
  assert.equal(restoreAmountForOrder(doc, "order-1"), 3);
  assert.equal(restoreAmountForOrder(doc, "order-2"), 5);
});

test("restoreAmountForOrder cae a 1 por compatibilidad con deductedOrderIds legado", () => {
  const doc = { orderDeductions: [], deductedOrderIds: ["order-9"] };
  assert.equal(restoreAmountForOrder(doc, "order-9"), 1);
});

test("restoreAmountForOrder regresa 0 cuando la orden no aparece en ningun lado", () => {
  const doc = { orderDeductions: [{ orderId: "order-1", quantity: 3 }], deductedOrderIds: ["order-2"] };
  assert.equal(restoreAmountForOrder(doc, "order-99"), 0);
  assert.equal(restoreAmountForOrder({}, "order-99"), 0);
});