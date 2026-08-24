import assert from "node:assert/strict";
import test from "node:test";

import { orderBowlSize, sortKitchenOrders } from "./kitchenOrder.js";

test("identifica el tamaño de bowls personalizados", () => {
  assert.deepEqual(orderBowlSize({ base: "white_rice", bowlSize: "normal" }), {
    title: "Tamaño del bowl",
    label: "MEDIANO",
    detail: "1–2 proteínas · 100 g",
    tone: "medium",
  });
  assert.equal(orderBowlSize({ base: "white_rice", bowlSize: "large" }).label, "GRANDE");
});

test("identifica tamaños de bowls del POS y pedidos mixtos", () => {
  assert.equal(orderBowlSize({
    items: [{ name: "Bowl de salmón esmeralda", category: "bowls", qty: 2 }],
  }).label, "MEDIANO");

  assert.deepEqual(orderBowlSize({
    items: [
      { name: "Bowl mediano", category: "bowls", qty: 1 },
      { name: "Bowl grande", category: "bowls", qty: 2 },
    ],
  }), {
    title: "Tamaños del pedido",
    label: "MIXTO",
    detail: "1 mediano · 2 grandes",
    tone: "large",
  });
});

test("muestra primero las órdenes activas más antiguas y deja listas al final", () => {
  const sorted = sortKitchenOrders([
    { _id: "new", status: "pending", createdAt: "2026-07-26T20:10:00.000Z" },
    { _id: "ready", status: "ready", createdAt: "2026-07-26T20:00:00.000Z" },
    { _id: "old", status: "preparing", createdAt: "2026-07-26T20:05:00.000Z" },
  ]);

  assert.deepEqual(sorted.map((order) => order._id), ["old", "new", "ready"]);
});
