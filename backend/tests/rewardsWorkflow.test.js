import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Redemption from "../models/Redemption.js";
import RewardVisit from "../models/RewardVisit.js";
import SocialStoryParticipant from "../models/SocialStoryParticipant.js";
import { createSocialStoryReward } from "../controllers/staffRewardsController.js";
import { getRewardPreview, redeemReward, getMyRedemptions } from "../controllers/rewardsController.js";
import { rewardStatus, rewardStatusLabel } from "../../src/utils/rewardStatus.js";

const staffId = "a".repeat(24), userId = "b".repeat(24);
const response = () => ({ code: 200, data: null, headers: {}, status(code) { this.code = code; return this; }, set(key, value) { this.headers[key] = value; return this; }, json(value) { this.data = value; return this; } });
const select = (value) => ({ select: async () => value });
const storyRequest = () => ({ staff: { id: staffId }, body: { platform: "instagram", handle: "@Cliente.QA", confirmedTagged: true, confirmedDisclosure: true } });
const duplicate = () => Object.assign(new Error("Duplicate key"), { code: 11000 });

function storyDatabase(t, { beforeInsertFails = false, acknowledgementLost = false } = {}) {
  let participant = null;
  let inserts = 0;
  const documents = new Map();
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "rewards-test-secret";
  t.after(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; });
  t.mock.method(console, "error", () => {});
  t.mock.method(SocialStoryParticipant, "findOneAndUpdate", async (filter, update, options) => {
    assert.equal(filter.handleNormalized, "cliente.qa");
    assert.equal(options.new, true);
    if (participant && participant.nextEligibleAt > new Date()) throw duplicate();
    participant = { ...update.$set, ...update.$setOnInsert };
    return { ...participant };
  });
  t.mock.method(SocialStoryParticipant, "findOne", async () => participant && { ...participant });
  t.mock.method(Redemption, "findById", async (id) => documents.get(String(id)) || null);
  t.mock.method(Redemption, "create", async (data) => {
    if (beforeInsertFails) { beforeInsertFails = false; throw new Error("DB unavailable before insert"); }
    if (documents.has(String(data._id))) throw duplicate();
    const doc = { ...data, status: "active", user: null, save: async () => {} };
    documents.set(String(data._id), doc); inserts++;
    if (acknowledgementLost) { acknowledgementLost = false; throw new Error("lost insert acknowledgement"); }
    return doc;
  });
  return { documents, participant: () => participant, inserts: () => inserts };
}

test("vista previa usa costo y vigencia del servidor sin gastar puntos", async (t) => {
  const visit = t.mock.method(RewardVisit, "updateOne", async () => ({}));
  const expiryCheck = t.mock.method(User, "updateOne", async (_filter, update) => { assert.deepEqual(update, { $set: { points: 0 } }); });
  t.mock.method(User, "findById", () => select({ points: 125 }));
  const spend = t.mock.method(User, "findOneAndUpdate", () => { throw new Error("No debe gastar"); });
  const res = response(); await getRewardPreview({ userId, params: { rewardId: "1" } }, res);
  assert.equal(res.code, 200); assert.equal(res.data.reward.cost, 50); assert.equal(res.data.remainingPoints, 75); assert.equal(res.data.validityDays, 90);
  assert.equal(res.headers["Cache-Control"], "no-store"); assert.equal(spend.mock.callCount(), 0); assert.equal(expiryCheck.mock.callCount(), 1);
  assert.equal(visit.mock.callCount(), 1);
  assert.equal(visit.mock.calls[0].arguments[0].user, userId);
  assert.ok(visit.mock.calls[0].arguments[1].$min.firstSelectionAt instanceof Date);
  const social = response(); await getRewardPreview({ userId, params: { rewardId: "101" } }, social);
  assert.equal(social.code, 400);
});

test("un costo distinto del confirmado se rechaza antes de descontar", async (t) => {
  t.mock.method(Redemption, "findOne", async () => null);
  t.mock.method(User, "findById", () => select({ points: 200, rewardRedemptionLedger: [] }));
  const spend = t.mock.method(User, "findOneAndUpdate", () => { throw new Error("No debe gastar"); });
  const res = response(); await redeemReward({ userId, body: { rewardId: 1, clientRedemptionId: "reward:confirmation-1", expectedPointsCost: 25 } }, res);
  assert.equal(res.code, 409); assert.equal(res.data.code, "REWARD_CHANGED"); assert.equal(spend.mock.callCount(), 0);
});

test("recuperar un canje ya emitido conserva el código aunque el catálogo haya cambiado", async (t) => {
  const existing = { rewardId: 1, code: "ABC234", status: "active" };
  t.mock.method(Redemption, "findOne", async () => existing);
  t.mock.method(User, "findById", () => select({ points: 75 }));
  const spend = t.mock.method(User, "findOneAndUpdate", () => { throw new Error("No debe gastar"); });
  const res = response(); await redeemReward({ userId, body: { rewardId: 1, clientRedemptionId: "reward:confirmation-1", expectedPointsCost: 25 } }, res);
  assert.equal(res.code, 200); assert.equal(res.data.redemption.code, "ABC234"); assert.equal(res.data.points, 75); assert.equal(spend.mock.callCount(), 0);
});

test("premios disponibles consulta solo activos del usuario, incluso más allá de los 30 históricos", async (t) => {
  t.mock.method(Redemption, "updateMany", async (filter) => { assert.equal(filter.user, userId); assert.ok(filter.expiresAt.$lte); });
  t.mock.method(Redemption, "find", (filter) => {
    assert.equal(filter.user, userId); assert.equal(filter.status, "active"); assert.ok(filter.$or);
    return { sort: async (sort) => { assert.equal(sort.expiresAt, 1); return Array(35).fill({ code: "ACTIVE", status: "active" }); } };
  });
  const res = response(); await getMyRedemptions({ userId, query: { status: "active" } }, res);
  assert.equal(res.data.redemptions.length, 35); assert.equal(res.headers["Cache-Control"], "no-store");
});

test("los estados cancelado y desconocido nunca se muestran como activos; vencimiento exacto", () => {
  const now = Date.parse("2026-11-11T20:00:00Z");
  assert.equal(rewardStatus({ status: "cancelled", expiresAt: "2027-01-01" }, now), "cancelled");
  assert.equal(rewardStatusLabel("cancelled"), "Cancelado"); assert.equal(rewardStatusLabel("cancelled", "en"), "Cancelled");
  assert.equal(rewardStatus({ status: "active", expiresAt: new Date(now).toISOString() }, now), "expired");
  assert.equal(rewardStatus({ status: "active", expiresAt: "bad-date" }, now), "unavailable");
  assert.equal(rewardStatus({ status: "future-state" }, now), "unavailable");
  assert.equal(rewardStatus({ status: "used", expiresAt: "2020-01-01" }, now), "used");
  assert.equal(rewardStatus({ status: "active", expiresAt: null }, now), "active");
});

test("reintentar historia tras perder la respuesta devuelve el mismo código, plazo y vigencia", async (t) => {
  const db = storyDatabase(t);
  const first = response(); await createSocialStoryReward(storyRequest(), first);
  assert.equal(first.code, 201);
  const second = response(); await createSocialStoryReward(storyRequest(), second);
  assert.equal(second.code, 200); assert.equal(second.data.recovered, true);
  assert.equal(second.data.redemption.code, first.data.redemption.code);
  assert.equal(second.data.redemption.expiresAt, first.data.redemption.expiresAt);
  assert.equal(second.data.nextEligibleAt, first.data.nextEligibleAt); assert.equal(db.inserts(), 1);
  const decoded = jwt.verify(second.data.claimToken, process.env.JWT_SECRET);
  assert.equal(decoded.redemptionId, String(first.data.redemption._id));
  assert.ok(decoded.exp * 1000 <= first.data.redemption.expiresAt.getTime());
});

test("dos solicitudes de historia simultáneas convergen en un solo premio", async (t) => {
  const db = storyDatabase(t);
  const first = response(), second = response();
  await Promise.all([createSocialStoryReward(storyRequest(), first), createSocialStoryReward(storyRequest(), second)]);
  assert.equal(db.inserts(), 1); assert.equal(first.data.redemption.code, second.data.redemption.code);
  assert.ok([200, 201].includes(first.code)); assert.ok([200, 201].includes(second.code));
});

test("una reserva interrumpida se completa al reintentar sin mover el inicio de los 30 días", async (t) => {
  const db = storyDatabase(t, { beforeInsertFails: true });
  const first = response(); await createSocialStoryReward(storyRequest(), first);
  assert.equal(first.code, 503); assert.equal(db.inserts(), 0);
  const original = { ...db.participant() };
  const retry = response(); await createSocialStoryReward(storyRequest(), retry);
  assert.equal(retry.code, 200); assert.equal(db.inserts(), 1);
  assert.equal(retry.data.nextEligibleAt, original.nextEligibleAt);
  assert.equal(retry.data.redemption._id, original.lastRedemptionId);
});

test("un insert confirmado en DB pero con respuesta perdida no crea otro premio", async (t) => {
  const db = storyDatabase(t, { acknowledgementLost: true });
  const res = response(); await createSocialStoryReward(storyRequest(), res);
  assert.equal(res.code, 200); assert.equal(db.inserts(), 1); assert.ok(res.data.claimToken);
});

test("premios usados, vencidos y cancelados no se reactivan al recuperar", async (t) => {
  const db = storyDatabase(t);
  const first = response(); await createSocialStoryReward(storyRequest(), first);
  const doc = db.documents.values().next().value;
  for (const status of ["used", "expired", "cancelled"]) {
    doc.status = status;
    const retry = response(); await createSocialStoryReward(storyRequest(), retry);
    assert.equal(retry.code, 409); assert.equal(retry.data.claimToken, undefined); assert.equal(db.inserts(), 1);
  }
});

test("un premio ya vinculado se recupera sin generar otro enlace para asociar cuentas", async (t) => {
  const db = storyDatabase(t);
  const first = response(); await createSocialStoryReward(storyRequest(), first);
  db.documents.values().next().value.user = userId;
  const retry = response(); await createSocialStoryReward(storyRequest(), retry);
  assert.equal(retry.code, 200); assert.equal(retry.data.claimToken, null); assert.equal(db.inserts(), 1);
});

test("los premios de historia anteriores a la actualización también se pueden recuperar", async (t) => {
  storyDatabase(t);
  const issuedAt = new Date(Date.now() - 3600000);
  t.mock.method(SocialStoryParticipant, "findOneAndUpdate", async () => { throw duplicate(); });
  t.mock.method(SocialStoryParticipant, "findOne", async () => ({ lastClaimAt: issuedAt, nextEligibleAt: new Date(Date.now() + 29 * 86400000) }));
  t.mock.method(Redemption, "findOne", async (filter) => {
    assert.equal(filter.verifiedAt, issuedAt);
    return { _id: userId, code: "LEGACY", status: "active", expiresAt: new Date(Date.now() + 86400000) };
  });
  const res = response(); await createSocialStoryReward(storyRequest(), res);
  assert.equal(res.code, 200); assert.equal(res.data.redemption.code, "LEGACY");
});

test("la recuperación sigue requiriendo verificación de la historia", async (t) => {
  const write = t.mock.method(SocialStoryParticipant, "findOneAndUpdate", async () => { throw new Error("No debe reservar"); });
  const req = storyRequest(); req.body.confirmedTagged = false;
  const res = response(); await createSocialStoryReward(req, res);
  assert.equal(res.code, 400); assert.equal(write.mock.callCount(), 0);
});
