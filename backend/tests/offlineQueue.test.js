import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const {
  flushQueuedOrders,
  getQueuedOrders,
  queueOrder,
} = await import("../../src/pos/offlineQueue.js");

beforeEach(() => storage.clear());

test("la cola conserva un clientOrderId y no duplica la misma venta", () => {
  const payload = { clientOrderId: "pos-test-order-0001", items: [{ id: 1, qty: 1 }] };
  queueOrder(payload);
  queueOrder(payload);

  assert.equal(getQueuedOrders().length, 1);
  assert.equal(getQueuedOrders()[0].payload.clientOrderId, payload.clientOrderId);
});

test("un error HTTP no elimina silenciosamente una venta pendiente", async () => {
  queueOrder({ clientOrderId: "pos-test-order-0002", items: [{ id: 2, qty: 1 }] });
  let reported = "";

  const sent = await flushQueuedOrders(
    { post: async () => { throw new Error("HTTP 503"); } },
    { onError: (_entry, error) => { reported = error.message; } }
  );

  assert.equal(sent, 0);
  assert.equal(reported, "HTTP 503");
  assert.equal(getQueuedOrders().length, 1);
});

test("una venta confirmada se elimina de la cola", async () => {
  queueOrder({ clientOrderId: "pos-test-order-0003", items: [{ id: 3, qty: 1 }] });

  const sent = await flushQueuedOrders({ post: async () => ({ ok: true }) });

  assert.equal(sent, 1);
  assert.deepEqual(getQueuedOrders(), []);
});
