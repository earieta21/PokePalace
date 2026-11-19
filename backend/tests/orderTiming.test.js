import assert from "node:assert/strict";
import { test } from "node:test";
import { createOrder, getWaitTime } from "../controllers/orderController.js";
import Order from "../models/Order.js";
import PromoCode from "../models/PromoCode.js";
import StoreSettings from "../models/StoreSettings.js";
import { getOrderTiming } from "../../src/utils/orderTiming.js";

test("checkout freezes the queue estimate before insertion and preserves it on retry", async (t) => {
  const now = Date.parse("2026-11-18T22:00:00Z"); // 14:00 en Tijuana
  t.mock.timers.enable({ apis: ["Date"], now });
  const count = t.mock.method(Order, "countDocuments", async () => 3);
  let stored;
  t.mock.method(Order, "findOne", () => ({ select: async () => stored }));
  t.mock.method(StoreSettings, "findOne", () => ({ select: async () => null }));
  t.mock.method(PromoCode, "findOne", () => ({ select: async () => null }));
  t.mock.method(Order, "create", async (fields) => { stored = new Order(fields); return stored; });

  const req = {
    body: {
      clientOrderId: "test-timing-order", customer: "Ana", phone: "1234567890",
      cart: [{ base: "white_rice", proteins: ["tuna"] }],
    },
    get: () => "a".repeat(32),
  };
  const res = {
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; },
  };
  await getWaitTime(req, res);
  assert.deepEqual(res.payload, { activeOrders: 3, waitMinutes: 17 });
  await createOrder(req, res);
  assert.equal(res.code, 201);
  assert.equal(res.payload.order.estimatedReadyAt.getTime(), now + 17 * 60_000);
  assert.deepEqual(count.mock.calls[0].arguments, count.mock.calls[1].arguments);

  t.mock.timers.tick(6 * 60_000);
  await createOrder(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.payload.idempotent, true);
  assert.equal(res.payload.order.estimatedReadyAt.getTime(), now + 17 * 60_000);
  assert.equal(count.mock.callCount(), 2);
});

test("tracking uses Tijuana time across daylight saving and pickup dates", () => {
  const winter = { status: "pending", estimatedReadyAt: "2026-11-18T22:17:00.000Z" };
  assert.equal(getOrderTiming(winter, "es").time, "14:17");
  assert.equal(getOrderTiming({ ...winter, status: "preparing" }, "es").label, "Recogida estimada");
  assert.match(getOrderTiming({ ...winter, estimatedReadyAt: "2026-07-15T22:17:00Z" }, "en").time, /3:17\s*PM/i);
  assert.equal(getOrderTiming({ ...winter, fulfillment: "dine_in" }, "en").label, "Estimated ready time");

  const scheduled = getOrderTiming({ ...winter, scheduledPickupTime: "2026-11-19T01:00:00Z" }, "en");
  assert.equal(scheduled.label, "Scheduled pickup");
  assert.match(scheduled.time, /Nov 18/);
  assert.match(scheduled.time, /5:00\s*PM/i);
  assert.equal(scheduled.dateTime, "2026-11-19T01:00:00.000Z");
});

test("tracking uses status alone for legacy orders and once the kitchen marks the order ready", () => {
  assert.equal(getOrderTiming({ status: "pending" }), null);
  for (const status of ["ready", "completed", "cancelled"]) {
    assert.equal(getOrderTiming({ status, estimatedReadyAt: "2026-11-18T22:17:00Z" }), null);
  }
});
