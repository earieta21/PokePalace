import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Redemption from "../models/Redemption.js";
import RewardVisit from "../models/RewardVisit.js";
import { recordRewardVisit, rewardConversionForMonth } from "../utils/rewardConversion.js";
import { dateKeyInTimeZone, startOfDateKey } from "../utils/timeZone.js";

const uri = process.env.REWARDS_TEST_MONGO_URI || (process.env.CI === "true" && process.env.MONGO_URI);

test("cuentas únicas desde el saldo elegible hasta una venta cobrada con su código", { skip: !uri }, async (t) => {
  // Use a database unique to this run, even when multiple suites share a CI server.
  const dbName = "reward_conversion_test_" + randomUUID().replaceAll("-", "");
  await mongoose.connect(uri, { dbName });
  t.after(async () => {
    try { await mongoose.connection.db.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  });
  await Promise.all([RewardVisit.init(), Order.init(), Redemption.init()]);
  const account = () => new mongoose.Types.ObjectId();
  const [buyer, uncollected, cancelled, previous, insufficient] = Array.from({ length: 5 }, account);
  await recordRewardVisit(insufficient, 49);
  await Promise.all([recordRewardVisit(buyer, 300), recordRewardVisit(buyer, 300, 300)]);
  await recordRewardVisit(buyer, 300, 50);
  await recordRewardVisit(uncollected, 50, 50);
  await recordRewardVisit(cancelled, 50, 50);
  await recordRewardVisit(previous, 100);

  const month = dateKeyInTimeZone(new Date()).slice(0, 7);
  const start = startOfDateKey(month + "-01");
  const end = new Date(Date.now() + 60000);
  async function issue(user, code, { paymentStatus = "paid", status = "completed", old = false, source = "loyalty", linked = true } = {}) {
    const createdAt = old ? new Date(start.getTime() - 1) : new Date();
    const orderId = account(), redemptionId = account();
    await Redemption.collection.insertOne({
      _id: redemptionId, user, code, pointsCost: 50, createdAt, usedAt: new Date(), order: orderId, source, status: "used",
    });
    await Order.collection.insertOne({ _id: orderId, source: "pos", paymentStatus, status, rewardRedemption: linked ? redemptionId : null });
    return orderId;
  }
  await issue(buyer, "CODE-A");
  await issue(buyer, "CODE-B");
  await issue(uncollected, "CODE-C", { paymentStatus: "pending" });
  const cancelledOrder = await issue(cancelled, "CODE-D");
  await issue(previous, "CODE-E", { old: true });
  await issue(previous, "CODE-F", { source: "social_story" });
  await issue(uncollected, "CODE-G", { linked: false });
  assert.deepEqual(await rewardConversionForMonth(start, end), { eligible: 4, selected: 3, issued: 3, used: 2 });
  await Order.updateOne({ _id: cancelledOrder }, { $set: { status: "cancelled" } });
  assert.deepEqual(await rewardConversionForMonth(start, end), { eligible: 4, selected: 3, issued: 3, used: 1 });
});
