import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Inventory from "../models/Inventory.js";
import Order from "../models/Order.js";
import InventoryMovement from "../models/InventoryMovement.js";
import AuditLog from "../models/AuditLog.js";
import { deductInventory, restoreInventoryForOrder } from "../services/orderInventory.js";
import { updateItem, restockItem } from "../controllers/staffInventoryController.js";
import { paymentWebhook } from "../controllers/orderController.js";

// Explicit opt-in keeps this suite away from the restaurant database.
const uri = process.env.INVENTORY_TEST_MONGO_URI;
const options = { skip: !uri };
const itemIds = [];
const orderIds = [];
const item = async (values) => {
  const doc = await Inventory.create({ item: "Inventory QA", unit: "kg", qty: 2, ...values });
  itemIds.push(doc._id);
  return doc;
};
const sale = async (values = {}) => {
  const doc = await Order.create({ source: "pos", paymentStatus: "paid", proteins: ["salmon"], ...values });
  orderIds.push(doc._id);
  return doc;
};
const response = () => ({ code: 200, body: null,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
  sendStatus(code) { this.code = code; return this; },
});

before(async () => {
  if (!uri) return;
  await mongoose.connect(uri);
  await InventoryMovement.init();
});
afterEach(async () => {
  if (!uri) return;
  await InventoryMovement.deleteMany({ itemId: { $in: itemIds } });
  await AuditLog.deleteMany({ entityId: { $in: itemIds } });
  await Inventory.deleteMany({ _id: { $in: itemIds } });
  await Order.deleteMany({ _id: { $in: orderIds } });
  itemIds.length = 0;
  orderIds.length = 0;
});
after(async () => { if (uri) await mongoose.disconnect(); });

test("concurrent sales and retries deduct the exact amount once with accurate movements", options, async () => {
  const stock = await item({ menuKeys: ["salmon"] });
  const first = await sale();
  const second = await sale();
  assert.deepEqual(await Promise.all([deductInventory(first), deductInventory(first), deductInventory(second)]), [true, true, true]);
  assert.equal((await Inventory.findById(stock._id)).qty, 1.8);
  const movements = await InventoryMovement.find({ itemId: stock._id }).sort({ qtyBefore: -1 });
  assert.equal(movements.length, 2);
  assert.deepEqual(movements.map((entry) => [entry.qtyBefore, entry.qtyAfter]), [[2, 1.9], [1.9, 1.8]]);
});

test("customer bowl plus water deducts each selection once and restores exact quantities", options, async () => {
  const salmon = await item({ unit: "g", qty: 1000, menuKeys: ["salmon"] });
  const water = await item({ unit: "L", qty: 10, menuKeys: ["agua_natural"] });
  const bowl = { kind: "bowl", base: "white_rice", proteins: ["salmon"] };
  const drink = { kind: "item", catalogId: "agua-del-dia", qty: 2 };
  const order = await sale({ source: "online", ...bowl, items: [drink], cartItems: [bowl, drink] });
  assert.equal(await deductInventory(order), true);
  assert.equal((await Inventory.findById(salmon._id)).qty, 900);
  assert.equal((await Inventory.findById(water._id)).qty, 9.053648);
  order.status = "cancelled";
  await order.save();
  await Promise.all([restoreInventoryForOrder(order), restoreInventoryForOrder(order)]);
  assert.equal((await Inventory.findById(salmon._id)).qty, 1000);
  assert.equal((await Inventory.findById(water._id)).qty, 10);
  assert.equal(await InventoryMovement.countDocuments({ itemId: { $in: [salmon._id, water._id] }, type: "sale_reversal" }), 2);
  assert.equal(await deductInventory(order), false);
  assert.equal((await Inventory.findById(water._id)).qty, 10);
});

test("partial stock and a later restock are preserved through retries and cancellation", options, async () => {
  const stock = await item({ qty: 0.03, menuKeys: ["salmon"] });
  const order = await sale();
  await deductInventory(order);
  assert.equal((await Inventory.findById(stock._id)).qty, 0);
  await Inventory.updateOne({ _id: stock._id }, { $inc: { qty: 1 } });
  await deductInventory(order);
  assert.equal((await Inventory.findById(stock._id)).qty, 1);
  order.status = "cancelled";
  await order.save();
  await restoreInventoryForOrder(order);
  assert.equal((await Inventory.findById(stock._id)).qty, 1.03);
});

test("configuring a missing serving later does not consume stock for an old sale", options, async () => {
  const stock = await item({ menuKeys: ["white_rice"] });
  const order = await sale({ base: "white_rice" });
  await deductInventory(order);
  assert.equal((await Inventory.findById(stock._id)).qty, 2);
  await Inventory.updateOne({ _id: stock._id }, { $set: { quantityPerPortion: 0.18 } });
  await deductInventory(order);
  assert.equal((await Inventory.findById(stock._id)).qty, 2);
  await deductInventory(await sale({ base: "white_rice" }));
  assert.equal((await Inventory.findById(stock._id)).qty, 1.82);
});

test("cancellation during reconciliation returns consumed stock before responding", options, async (t) => {
  const stock = await item({ menuKeys: ["salmon"] });
  const order = await sale();
  const original = Order.updateOne;
  t.mock.method(Order, "updateOne", async function (filter, update, ...args) {
    const result = await original.call(this, filter, update, ...args);
    if (update?.$set?.ingredientsDeducted === true) {
      await original.call(this, { _id: order._id }, { $set: { status: "cancelled" } });
      await restoreInventoryForOrder(order);
    }
    return result;
  });
  assert.equal(await deductInventory(order), false);
  assert.equal((await Inventory.findById(stock._id)).qty, 2);
});

test("a manual count conflicts with intervening sales but editing metadata preserves stock", options, async () => {
  const stock = await item({ menuKeys: ["salmon"] });
  await deductInventory(await sale());
  const conflict = response();
  await updateItem({ params: { id: stock._id }, body: { qty: 3, expectedQty: 2 } }, conflict);
  assert.equal(conflict.code, 409);
  const saved = response();
  await updateItem({ params: { id: stock._id }, body: { supplier: "QA" } }, saved);
  assert.equal(saved.code, 200);
  assert.equal((await Inventory.findById(stock._id)).qty, 1.9);
  await Promise.all([restockItem({ params: { id: stock._id }, body: { amount: 1, registerExpense: false } }, response()), deductInventory(await sale())]);
  assert.equal((await Inventory.findById(stock._id)).qty, 2.8);
});

test("a confirmed online payment and repeated webhooks deduct water only once", options, async (t) => {
  const stock = await item({ unit: "botellas", qty: 8, menuKeys: ["botella_de_agua"] });
  const order = await sale({ source: "online", proteins: [], paymentStatus: "pending", paymentRequestId: "qa-charge",
    items: [{ catalogId: "bottled-water", qty: 2 }] });
  const envKeys = ["OPENPAY_WEBHOOK_USER", "OPENPAY_WEBHOOK_PASSWORD", "OPENPAY_PRIVATE_KEY", "OPENPAY_MERCHANT_ID"];
  const original = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) process.env[key] = "inventory-qa";
  t.after(() => { for (const key of envKeys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } });
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ status: "completed" }) }));
  const req = { headers: { authorization: `Basic ${Buffer.from("inventory-qa:inventory-qa").toString("base64")}` }, body: { transaction: { id: "qa-charge" } } };
  for (let retry = 0; retry < 2; retry++) {
    const res = response();
    await paymentWebhook(req, res);
    assert.equal(res.code, 200);
  }
  assert.equal((await Order.findById(order._id)).paymentStatus, "paid");
  assert.equal((await Inventory.findById(stock._id)).qty, 6);
  assert.equal(await InventoryMovement.countDocuments({ itemId: stock._id }), 1);
});
