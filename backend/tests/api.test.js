import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import PromoCode from "../models/PromoCode.js";
import Order from "../models/Order.js";
import StaffUser from "../models/StaffUser.js";
import Inventory from "../models/Inventory.js";
import InventoryMovement from "../models/InventoryMovement.js";
import AuditLog from "../models/AuditLog.js";
import Redemption from "../models/Redemption.js";
import StoreSettings from "../models/StoreSettings.js";
import { dateKeyInTimeZone, nextDateKey, zonedDateTimeToUtc } from "../utils/timeZone.js";
import { stableCustomerOrderObjectId } from "../utils/orderReservations.js";

/* Prueba de integración del flujo crítico: arranca el servidor real contra
   el MongoDB de CI y ejercita las rutas que pagan la renta — crear una orden
   con precio calculado en el servidor, validaciones y autenticación. */

const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}`;
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DB_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/pokepalace_ci";

let server;
let serverOutput = "";
const staffFixtures = {};
const staffTokens = {};
const STAFF_FIXTURE_PREFIX = "ci-staff-security-";

before(async () => {
  server = spawn(process.execPath, ["server.js"], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      MONGO_URI: TEST_DB_URI,
      JWT_SECRET: process.env.JWT_SECRET || "ci-test-secret",
      PIN_PEPPER: process.env.PIN_PEPPER || "ci-test-pepper",
    },
    // stdout NO se hereda: el runner de node:test interpreta stdout como TAP
    // y los logs del servidor lo contaminarían. Se capturan para diagnóstico.
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });

  // Espera a que el servidor conteste (mongoose puede tardar en conectar)
  const deadline = Date.now() + 45000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) {
        await mongoose.connect(TEST_DB_URI);
        await StaffUser.deleteMany({ email: { $regex: `^${STAFF_FIXTURE_PREFIX}` } });
        const password = await bcrypt.hash("ci-only-password", 10);
        for (const role of ["employee", "cashier", "kitchen", "manager", "admin", "owner"]) {
          const employee = await StaffUser.create({
            name: `CI ${role}`,
            email: `${STAFF_FIXTURE_PREFIX}${role}@example.test`,
            password,
            role,
            locationId: "main",
            active: true,
          });
          staffFixtures[role] = employee;
          staffTokens[role] = jwt.sign(
            { id: employee._id, role, type: "staff" },
            process.env.JWT_SECRET || "ci-test-secret",
            { expiresIn: "10m" }
          );
        }
        return;
      }
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `El servidor no arrancó a tiempo: ${lastError?.message}\n--- salida del servidor ---\n${serverOutput}`
  );
});

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await Order.deleteMany({ clientOrderId: { $regex: "^ci-pos-security:" } });
    await Order.deleteMany({ clientOrderId: { $regex: "^ci-web:" } });
    const ciInventoryIds = await Inventory.find({ item: { $regex: "^CI Security" } }).distinct("_id");
    await InventoryMovement.deleteMany({ itemId: { $in: ciInventoryIds } });
    await AuditLog.deleteMany({ entity: "Inventory", entityId: { $in: ciInventoryIds } });
    await Inventory.deleteMany({ item: { $regex: "^CI Security" } });
    await Redemption.deleteMany({ code: { $regex: "^CIPOS" } });
    await Redemption.deleteMany({ clientRedemptionId: { $regex: "^reward:ci-" } });
    await User.deleteMany({ email: { $regex: "^ci-pos-security-" } });
    await StaffUser.deleteMany({ email: { $regex: `^${STAFF_FIXTURE_PREFIX}` } });
    await mongoose.disconnect();
  }
  server?.kill("SIGKILL");
});

// Hora programada determinista: mañana a las 15:00 del reloj del servidor
// (dentro del horario 11-21 sin importar a qué hora corra el CI). El
// restaurante cierra los miércoles — si "mañana" cae en miércoles, se
// salta al jueves para que esto nunca falle solo por la fecha en que
// corra CI.
function tomorrowAt15() {
  let key = nextDateKey(dateKeyInTimeZone());
  let [year, month, day] = key.split("-").map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 3) {
    key = nextDateKey(key);
    [year, month, day] = key.split("-").map(Number);
  }
  return zonedDateTimeToUtc({ year, month, day, hour: 15 }).toISOString();
}

const postJSON = (url, body, extraHeaders = {}) =>
  fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });

const customerAttempt = (label) => ({
  clientOrderId: `ci-web:${label}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
  orderToken: randomBytes(32).toString("base64url"),
});

const postCustomerOrder = (body, label) => {
  const attempt = customerAttempt(label);
  return postJSON(
    "/api/orders",
    { ...body, clientOrderId: attempt.clientOrderId },
    { "X-Order-Token": attempt.orderToken }
  );
};

const staffRequest = (role, url, { method = "GET", body } = {}) =>
  fetch(`${BASE}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${staffTokens[role]}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

test("el servidor responde", async () => {
  const r = await fetch(`${BASE}/`);
  assert.equal(r.status, 200);
});

test("el resumen protegido informa el total de clientes registrados", async () => {
  const expectedCustomers = await User.countDocuments({ role: "user" });
  const managerResponse = await staffRequest("manager", "/api/staff/summary");

  assert.equal(managerResponse.status, 200);
  const summary = await managerResponse.json();
  assert.equal(summary.registeredCustomers, expectedCustomers);

  const cashierResponse = await staffRequest("cashier", "/api/staff/summary");
  assert.equal(cashierResponse.status, 403);
});

test("crear orden valida: el precio lo pone el servidor, no el cliente", async () => {
  const attempt = customerAttempt("price");
  const r = await postJSON("/api/orders", {
    cart: [{ base: "white_rice", proteins: ["salmon"] }],
    customer: "Prueba CI",
    phone: "6630000000",
    scheduledPickupTime: tomorrowAt15(),
    total: 1, // intento de manipular el precio — debe ignorarse
    clientOrderId: attempt.clientOrderId,
  }, { "X-Order-Token": attempt.orderToken });
  assert.equal(r.status, 201);
  const { order } = await r.json();
  assert.equal(order.total, 230); // precio real del bowl mediano
  assert.equal(order.paymentStatus, "pending");
  assert.equal(order.source, "online");
});

test("checkout rechaza ingredientes agotados antes de reservar promo o puntos", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const account = await User.create({
    name: "Disponibilidad CI",
    email: `ci-availability-${suffix}@example.test`,
    password: await bcrypt.hash("prueba-segura-123", 10),
    points: 200,
  });
  const token = jwt.sign(
    { id: account._id },
    process.env.JWT_SECRET || "ci-test-secret",
    { expiresIn: "10m" }
  );
  const promo = await PromoCode.create({
    code: `STOCK${Date.now()}${Math.floor(Math.random() * 1000)}`,
    discountType: "fixed",
    discountValue: 20,
    maxUses: 1,
  });
  const originalSettings = await StoreSettings.findOne({ key: "main" }).lean();
  const attempt = customerAttempt("unavailable");

  try {
    await StoreSettings.findOneAndUpdate(
      { key: "main" },
      { $set: { unavailableItems: ["tuna"] } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const response = await postJSON("/api/orders", {
      cart: [{ base: "white_rice", proteins: ["salmon", "tuna"] }],
      customer: "Disponibilidad CI",
      phone: "6630000099",
      scheduledPickupTime: tomorrowAt15(),
      promoCode: promo.code,
      pointsToRedeem: 100,
      clientOrderId: attempt.clientOrderId,
    }, { Authorization: `Bearer ${token}` });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.code, "ITEM_UNAVAILABLE");
    assert.deepEqual(body.unavailableItems, ["tuna"]);

    const [userAfter, promoAfter, order] = await Promise.all([
      User.findById(account._id),
      PromoCode.findById(promo._id).select("+reservedOrderUses"),
      Order.findOne({ clientOrderId: attempt.clientOrderId }),
    ]);
    assert.equal(userAfter.points, 200);
    assert.equal(promoAfter.usedCount, 0);
    assert.equal(promoAfter.reservedOrderUses.length, 0);
    assert.equal(order, null);
  } finally {
    await Promise.all([
      StoreSettings.findOneAndUpdate(
        { key: "main" },
        { $set: { unavailableItems: originalSettings?.unavailableItems ?? [] } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
      PromoCode.deleteOne({ _id: promo._id }),
      User.deleteOne({ _id: account._id }),
    ]);
  }
});

test("una orden invitada exige su token secreto para consultar y cancelar", async () => {
  const attempt = customerAttempt("guest-access");
  const created = await postJSON("/api/orders", {
    cart: [{ base: "white_rice", proteins: ["salmon"] }],
    customer: "Invitado protegido",
    phone: "6630000001",
    scheduledPickupTime: tomorrowAt15(),
    clientOrderId: attempt.clientOrderId,
  }, { "X-Order-Token": attempt.orderToken });
  assert.equal(created.status, 201);

  const payload = await created.json();
  const orderId = payload.order._id;
  assert.match(payload.orderToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(payload.order.guestAccessTokenHash, undefined);

  const withoutToken = await fetch(`${BASE}/api/orders/${orderId}`);
  assert.equal(withoutToken.status, 404);

  const wrongToken = await fetch(`${BASE}/api/orders/${orderId}`, {
    headers: { "X-Order-Token": "token-equivocado" },
  });
  assert.equal(wrongToken.status, 404);

  const authorized = await fetch(`${BASE}/api/orders/${orderId}`, {
    headers: { "X-Order-Token": payload.orderToken },
  });
  assert.equal(authorized.status, 200);
  const authorizedBody = await authorized.json();
  assert.equal(authorizedBody.order.customer, "Invitado protegido");
  assert.equal(authorizedBody.order.guestAccessTokenHash, undefined);

  const deniedCancel = await fetch(`${BASE}/api/orders/${orderId}/cancel`, {
    method: "PATCH",
    headers: { "X-Order-Token": "token-equivocado" },
  });
  assert.equal(deniedCancel.status, 404);

  const cancelled = await fetch(`${BASE}/api/orders/${orderId}/cancel`, {
    method: "PATCH",
    headers: { "X-Order-Token": payload.orderToken },
  });
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).order.status, "cancelled");

  // The endpoint is idempotent for an authorized retry.
  const retried = await fetch(`${BASE}/api/orders/${orderId}/cancel`, {
    method: "PATCH",
    headers: { "X-Order-Token": payload.orderToken },
  });
  assert.equal(retried.status, 200);
});

test("el QR de seguimiento del kiosco puede autenticarse con ?ot= en vez del header", async () => {
  const attempt = customerAttempt("kiosk-qr");
  const created = await postJSON("/api/orders", {
    cart: [{ base: "white_rice", proteins: ["salmon"] }],
    customer: "Cliente de kiosco",
    phone: "6630000002",
    scheduledPickupTime: tomorrowAt15(),
    clientOrderId: attempt.clientOrderId,
  }, { "X-Order-Token": attempt.orderToken });
  assert.equal(created.status, 201);
  const { order, orderToken } = await created.json();

  // Sin token: no autorizado (simula abrir el link sin el query param).
  const withoutToken = await fetch(`${BASE}/api/orders/${order._id}`);
  assert.equal(withoutToken.status, 404);

  // Token equivocado por query param: tampoco autorizado.
  const wrongQueryToken = await fetch(`${BASE}/api/orders/${order._id}?ot=token-equivocado`);
  assert.equal(wrongQueryToken.status, 404);

  // Token correcto por query param (así llega desde el QR del kiosco, en un
  // celular que nunca tuvo el header X-Order-Token guardado localmente).
  const viaQuery = await fetch(`${BASE}/api/orders/${order._id}?ot=${orderToken}`);
  assert.equal(viaQuery.status, 200);
  assert.equal((await viaQuery.json()).order.customer, "Cliente de kiosco");
});

test("solo el dueño ve su orden y cancelar revierte puntos/promo exactamente una vez", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const ownerRegistration = await postJSON("/api/auth/register", {
    name: "Dueño CI",
    email: `owner-${suffix}@example.test`,
    password: "prueba-segura-123",
  });
  assert.equal(ownerRegistration.status, 201);
  const owner = await ownerRegistration.json();

  const strangerRegistration = await postJSON("/api/auth/register", {
    name: "Otro cliente CI",
    email: `stranger-${suffix}@example.test`,
    password: "prueba-segura-123",
  });
  assert.equal(strangerRegistration.status, 201);
  const stranger = await strangerRegistration.json();

  await User.updateOne({ _id: owner.user.id }, { $set: { points: 200 } });
  const promo = await PromoCode.create({
    code: `SEC${Date.now()}${Math.floor(Math.random() * 1000)}`,
    discountType: "fixed",
    discountValue: 20,
    maxUses: 1,
  });

  const created = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${owner.token}`,
    },
    body: JSON.stringify({
      cart: [{ base: "white_rice", proteins: ["salmon"] }],
      customer: "Dueño CI",
      phone: "6630000002",
      scheduledPickupTime: tomorrowAt15(),
      pointsToRedeem: 100,
      promoCode: promo.code,
      clientOrderId: `ci-web:owner:${suffix}`,
    }),
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  const orderId = createdBody.order._id;
  assert.equal(createdBody.orderToken, undefined);
  assert.equal(createdBody.order.pointsRedeemed, 100);

  assert.equal((await User.findById(owner.user.id)).points, 100);
  const promoReserved = await PromoCode.findById(promo._id).select("+reservedOrderUses");
  assert.equal(promoReserved.usedCount, 1);
  assert.equal(promoReserved.reservedOrderUses.filter((id) => String(id) === orderId).length, 1);

  const anonymousRead = await fetch(`${BASE}/api/orders/${orderId}`);
  assert.equal(anonymousRead.status, 404);

  const strangerRead = await fetch(`${BASE}/api/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${stranger.token}` },
  });
  assert.equal(strangerRead.status, 404);

  const ownerRead = await fetch(`${BASE}/api/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(ownerRead.status, 200);

  const anonymousCancel = await fetch(`${BASE}/api/orders/${orderId}/cancel`, { method: "PATCH" });
  assert.equal(anonymousCancel.status, 404);

  const strangerCancel = await fetch(`${BASE}/api/orders/${orderId}/cancel`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${stranger.token}` },
  });
  assert.equal(strangerCancel.status, 404);

  const cancelAsOwner = () => fetch(`${BASE}/api/orders/${orderId}/cancel`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${owner.token}` },
  });

  // Simultaneous cancellation requests exercise the deduplication ledgers.
  const [firstCancel, secondCancel] = await Promise.all([cancelAsOwner(), cancelAsOwner()]);
  assert.equal(firstCancel.status, 200);
  assert.equal(secondCancel.status, 200);

  let ownerAfter = await User.findById(owner.user.id).select("+cancelledOrderRefunds");
  let promoAfter = await PromoCode.findById(promo._id)
    .select("+reservedOrderUses +releasedOrderUses");
  assert.equal(ownerAfter.points, 200);
  assert.equal(ownerAfter.cancelledOrderRefunds.filter((id) => String(id) === orderId).length, 1);
  assert.equal(promoAfter.usedCount, 0);
  assert.equal(promoAfter.reservedOrderUses.length, 0);
  assert.equal(promoAfter.releasedOrderUses.filter((id) => String(id) === orderId).length, 1);

  // Simulate an interrupted response after the atomic ledgers were written.
  // A normal tracking read must reconcile markers without refunding again.
  await Order.updateOne(
    { _id: orderId },
    {
      $set: {
        pointsRefundedAt: null,
        promoUseReleasedAt: null,
        cancellationReversedAt: null,
      },
    }
  );
  const recoveryRead = await fetch(`${BASE}/api/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(recoveryRead.status, 200);
  assert.ok((await recoveryRead.json()).order.cancellationReversedAt);

  const thirdCancel = await cancelAsOwner();
  assert.equal(thirdCancel.status, 200);
  ownerAfter = await User.findById(owner.user.id).select("+cancelledOrderRefunds");
  promoAfter = await PromoCode.findById(promo._id)
    .select("+reservedOrderUses +releasedOrderUses");
  assert.equal(ownerAfter.points, 200);
  assert.equal(promoAfter.usedCount, 0);
});

test("una cancelación anterior se adopta sin devolver los puntos por segunda vez", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const registration = await postJSON("/api/auth/register", {
    name: "Cliente cancelación anterior",
    email: `ci-legacy-cancel-${suffix}@example.test`,
    password: "prueba-segura-123",
  });
  assert.equal(registration.status, 201);
  const account = await registration.json();
  await User.updateOne({ _id: account.user.id }, { $set: { points: 200 } });

  const promo = await PromoCode.create({
    code: `LEGACY${Date.now()}${Math.floor(Math.random() * 1000)}`,
    discountType: "fixed",
    discountValue: 20,
    usedCount: 1,
  });
  const legacyOrder = await Order.create({
    user: account.user.id,
    clientOrderId: `ci-web:legacy-cancel:${suffix}`,
    customer: "Cliente cancelación anterior",
    source: "online",
    status: "cancelled",
    paymentStatus: "pending",
    pointsRedeemed: 100,
    promoCode: promo.code,
    cancelledAt: null,
    pointsRefundedAt: null,
    promoUseReleasedAt: null,
    cancellationReversedAt: null,
  });

  const recovered = await fetch(`${BASE}/api/orders/${legacyOrder._id}`, {
    headers: { Authorization: `Bearer ${account.token}` },
  });
  assert.equal(recovered.status, 200);
  const recoveredOrder = (await recovered.json()).order;
  assert.ok(recoveredOrder.pointsRefundedAt);
  assert.ok(recoveredOrder.promoUseReleasedAt);
  assert.ok(recoveredOrder.cancellationReversedAt);

  const [userAfter, promoAfter] = await Promise.all([
    User.findById(account.user.id).select("+cancelledOrderRefunds"),
    PromoCode.findById(promo._id).select("+releasedOrderUses"),
  ]);
  assert.equal(userAfter.points, 200);
  assert.equal(
    userAfter.cancelledOrderRefunds.filter((id) => String(id) === String(legacyOrder._id)).length,
    1
  );
  assert.equal(promoAfter.usedCount, 0);
  assert.equal(
    promoAfter.releasedOrderUses.filter((id) => String(id) === String(legacyOrder._id)).length,
    1
  );
});

test("un retry recupera reservas confirmadas sin gastar promo ni puntos dos veces", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const registration = await postJSON("/api/auth/register", {
    name: "Cliente ACK perdido",
    email: `ci-order-reservation-${suffix}@example.test`,
    password: "prueba-segura-123",
  });
  assert.equal(registration.status, 201);
  const account = await registration.json();

  const clientOrderId = `ci-web:ack:${suffix}`;
  const attemptOrderId = stableCustomerOrderObjectId(clientOrderId);
  await User.updateOne({ _id: account.user.id }, { $set: { points: 200 } });
  // Simula que Mongo aplicó el decremento + ledger atómicos y se perdió solo
  // el ACK: el saldo ya quedó en 100 antes de que el checkout sea reintentado.
  await User.updateOne(
    { _id: account.user.id, points: { $gte: 100 } },
    {
      $inc: { points: -100 },
      $push: {
        orderPointReservations: {
          orderId: attemptOrderId,
          points: 100,
          createdAt: new Date(),
        },
      },
    }
  );
  const promo = await PromoCode.create({
    code: `ACK${Date.now()}${Math.floor(Math.random() * 1000)}`,
    discountType: "fixed",
    discountValue: 20,
    maxUses: 1,
    usedCount: 1,
    reservedOrderUses: [attemptOrderId],
  });

  const retryCheckout = () => fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${account.token}`,
    },
    body: JSON.stringify({
      cart: [{ base: "white_rice", proteins: ["salmon"] }],
      customer: "Cliente ACK perdido",
      phone: "6630000003",
      scheduledPickupTime: tomorrowAt15(),
      pointsToRedeem: 100,
      promoCode: promo.code,
      clientOrderId,
    }),
  });

  const completed = await retryCheckout();
  assert.equal(completed.status, 201);
  const completedBody = await completed.json();
  assert.equal(completedBody.order._id, String(attemptOrderId));
  assert.equal(completedBody.order.pointsRedeemed, 100);

  const repeated = await retryCheckout();
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).idempotent, true);

  const userAfter = await User.findById(account.user.id).select("+orderPointReservations");
  const promoAfter = await PromoCode.findById(promo._id).select("+reservedOrderUses");
  assert.equal(userAfter.points, 100);
  assert.equal(
    userAfter.orderPointReservations.filter((entry) => String(entry.orderId) === String(attemptOrderId)).length,
    1
  );
  assert.equal(promoAfter.usedCount, 1);
  assert.equal(
    promoAfter.reservedOrderUses.filter((id) => String(id) === String(attemptOrderId)).length,
    1
  );
});

test("un canje Rewards concurrente descuenta y genera un solo código", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const registration = await postJSON("/api/auth/register", {
    name: "Cliente Rewards idempotente",
    email: `ci-pos-security-reward-${suffix}@example.test`,
    password: "prueba-segura-123",
  });
  assert.equal(registration.status, 201);
  const account = await registration.json();
  await User.updateOne({ _id: account.user.id }, { $set: { points: 100 } });

  const clientRedemptionId = `reward:ci-${suffix}`;
  const redeem = (rewardId = 1) => postJSON(
    "/api/rewards/redeem",
    { rewardId, clientRedemptionId },
    { Authorization: `Bearer ${account.token}` }
  );

  const [first, second] = await Promise.all([redeem(), redeem()]);
  assert.deepEqual([first.status, second.status].sort(), [200, 201]);
  const firstBody = await first.json();
  const secondBody = await second.json();
  assert.equal(firstBody.redemption.code, secondBody.redemption.code);

  const userAfter = await User.findById(account.user.id).select("+rewardRedemptionLedger");
  assert.equal(userAfter.points, 50);
  assert.equal(
    userAfter.rewardRedemptionLedger.filter(
      (entry) => entry.clientRedemptionId === clientRedemptionId
    ).length,
    1
  );
  assert.equal(
    await Redemption.countDocuments({ user: account.user.id, clientRedemptionId }),
    1
  );

  const storyAttempt = await postJSON(
    "/api/rewards/redeem",
    { rewardId: 101, clientRedemptionId: `reward:ci-story-${suffix}` },
    { Authorization: `Bearer ${account.token}` }
  );
  assert.equal(storyAttempt.status, 400);
  assert.equal((await User.findById(account.user.id)).points, 50);
});

test("orden sin base ni proteina se rechaza", async () => {
  const r = await postCustomerOrder({
    customer: "Prueba CI",
    phone: "6630000000",
    scheduledPickupTime: tomorrowAt15(),
  }, "invalid-bowl");
  assert.equal(r.status, 400);
});

test("mas de 3 proteinas se rechaza", async () => {
  const r = await postCustomerOrder({
    cart: [{ base: "white_rice", proteins: ["salmon", "tuna", "shrimp", "tofu"] }],
    customer: "Prueba CI",
    phone: "6630000000",
    scheduledPickupTime: tomorrowAt15(),
  }, "too-many-proteins");
  assert.equal(r.status, 400);
});

test("orden sin nombre/telefono se rechaza", async () => {
  const r = await postCustomerOrder({
    cart: [{ base: "white_rice", proteins: ["salmon"] }],
    scheduledPickupTime: tomorrowAt15(),
  }, "missing-contact");
  assert.equal(r.status, 400);
});

test("registro rechaza contraseñas menores de 8 caracteres", async () => {
  const r = await postJSON("/api/auth/register", {
    name: "Cliente CI",
    email: `cliente-${Date.now()}@example.com`,
    password: "corta",
  });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.match(body.msg, /8 caracteres/);
});

test("pin-login sin locationId se rechaza", async () => {
  const r = await postJSON("/api/staff-auth/pin-login", { pin: "1234" });
  assert.equal(r.status, 400);
});

test("las rutas de staff exigen token", async () => {
  const r = await fetch(`${BASE}/api/staff/inventory`);
  assert.equal(r.status, 401);
});

test("la jerarquía protege owner/admin y conserva los flujos de caja/cocina", async () => {
  const forbiddenRole = await staffRequest("manager", "/api/kiosk/employees", {
    method: "POST",
    body: { name: "Escalación CI", role: "owner", pin: "7319", locationId: "main" },
  });
  assert.equal(forbiddenRole.status, 403);

  const forbiddenCashierGrant = await staffRequest("manager", "/api/kiosk/employees", {
    method: "POST",
    body: { name: "Escalación Caja CI", role: "cashier", pin: "7318", locationId: "main" },
  });
  assert.equal(forbiddenCashierGrant.status, 403);

  const adminCannotCreateOwner = await staffRequest("admin", "/api/kiosk/employees", {
    method: "POST",
    body: { name: "Owner falso CI", role: "owner", pin: "7317", locationId: "main" },
  });
  assert.equal(adminCannotCreateOwner.status, 403);

  const managerCannotEditOwner = await staffRequest(
    "manager",
    `/api/kiosk/employees/${staffFixtures.owner._id}`,
    { method: "PATCH", body: { name: "Nombre manipulado" } }
  );
  assert.equal(managerCannotEditOwner.status, 403);

  const managerCannotDeleteOwner = await staffRequest(
    "manager",
    `/api/kiosk/employees/${staffFixtures.owner._id}`,
    { method: "DELETE" }
  );
  assert.equal(managerCannotDeleteOwner.status, 403);

  assert.equal((await staffRequest("employee", "/api/staff/orders")).status, 403);
  assert.equal((await staffRequest("kitchen", "/api/staff/orders?limit=1")).status, 200);
  assert.equal((await staffRequest("kitchen", "/api/staff/orders", {
    method: "POST",
    body: { items: [{ catalogId: "coca-zero", qty: 1 }] },
  })).status, 403);
});

test("el POS calcula catálogo, deduplica reintentos y descuenta inventario una vez", async () => {
  const clientOrderId = `ci-pos-security:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const inventory = await Inventory.create({
    item: `CI Security Coca-Zero ${Date.now()}`,
    unit: "porción",
    qty: 5,
    minQty: 0,
    menuKeys: ["coca_zero"],
  });
  const payload = {
    clientOrderId,
    items: [{ catalogId: "coca-zero", name: "Artículo manipulado", price: 0.01, qty: 2 }],
    customer: "Mostrador CI",
    phone: "6630000001",
    fulfillment: "pickup",
    paymentMethod: "cash",
  };

  const created = await staffRequest("cashier", "/api/staff/orders", { method: "POST", body: payload });
  assert.equal(created.status, 201);
  const firstBody = await created.json();
  assert.equal(firstBody.order.subtotal, 60);
  assert.equal(firstBody.order.total, 60);
  assert.equal(firstBody.order.items[0].name, "Coca-Zero");
  assert.equal(firstBody.order.items[0].price, 30);

  const retried = await staffRequest("cashier", "/api/staff/orders", { method: "POST", body: payload });
  assert.equal(retried.status, 200);
  const retryBody = await retried.json();
  assert.equal(retryBody.idempotent, true);
  assert.equal(retryBody.order._id, firstBody.order._id);

  const foreignRetry = await staffRequest("manager", "/api/staff/orders", { method: "POST", body: payload });
  assert.equal(foreignRetry.status, 200);
  const foreignRetryBody = await foreignRetry.json();
  assert.equal(foreignRetryBody.order._id, firstBody.order._id);
  assert.equal(foreignRetryBody.order.staffId, String(staffFixtures.cashier._id));

  const [paidAgain, preparing] = await Promise.all([
    staffRequest("cashier", `/api/staff/orders/${firstBody.order._id}/pay`, { method: "PATCH", body: {} }),
    staffRequest("kitchen", `/api/staff/orders/${firstBody.order._id}/status`, {
      method: "PATCH",
      body: { status: "preparing" },
    }),
  ]);
  assert.equal(paidAgain.status, 200);
  assert.equal(preparing.status, 200);

  const ready = await staffRequest("kitchen", `/api/staff/orders/${firstBody.order._id}/status`, {
    method: "PATCH",
    body: { status: "ready" },
  });
  assert.equal(ready.status, 200);
  const kitchenStatusOrder = (await ready.json()).order;
  assert.equal(kitchenStatusOrder.status, "ready");
  for (const privateField of ["phone", "user", "paymentMethod", "total", "rewardCode"]) {
    assert.equal(kitchenStatusOrder[privateField], undefined, `${privateField} no debe llegar a cocina`);
  }

  const kitchenVisible = await staffRequest(
    "kitchen",
    "/api/staff/orders?status=pending,preparing,ready,completed,cancelled&limit=0"
  );
  assert.equal(kitchenVisible.status, 200);
  const kitchenTicket = (await kitchenVisible.json()).orders
    .find((order) => order._id === firstBody.order._id);
  assert.ok(kitchenTicket);
  assert.equal(kitchenTicket.status, "ready");
  assert.equal(kitchenTicket.customer, "Mostrador CI");
  for (const privateField of [
    "phone", "user", "staffId", "clientOrderId", "paymentMethod",
    "paymentStatus", "subtotal", "tax", "total", "discountAmount",
    "promoCode", "pointsRedeemed", "loyaltyPointsEarned", "rewardCode",
  ]) {
    assert.equal(kitchenTicket[privateField], undefined, `${privateField} no debe llegar a cocina`);
  }

  assert.equal((await staffRequest("kitchen", `/api/staff/orders/${firstBody.order._id}/status`, {
    method: "PATCH",
    body: { status: "completed" },
  })).status, 403);
  assert.equal((await staffRequest("kitchen", `/api/staff/orders/${firstBody.order._id}/status`, {
    method: "PATCH",
    body: { status: "cancelled" },
  })).status, 403);

  const completed = await staffRequest("cashier", `/api/staff/orders/${firstBody.order._id}/status`, {
    method: "PATCH",
    body: { status: "completed" },
  });
  assert.equal(completed.status, 200);

  const kitchenHistoryAttempt = await staffRequest(
    "kitchen",
    "/api/staff/orders?status=pending,preparing,ready,completed,cancelled&limit=999999"
  );
  assert.equal(kitchenHistoryAttempt.status, 200);
  const kitchenOrders = (await kitchenHistoryAttempt.json()).orders;
  assert.ok(kitchenOrders.length <= 50);
  assert.ok(kitchenOrders.every((order) => ["pending", "preparing", "ready"].includes(order.status)));
  assert.equal(kitchenOrders.some((order) => order._id === firstBody.order._id), false);

  assert.equal((await staffRequest("cashier", `/api/staff/orders/${firstBody.order._id}/status`, {
    method: "PATCH",
    body: { status: "pending" },
  })).status, 409);

  assert.equal(await Order.countDocuments({ clientOrderId }), 1);
  const inventoryAfter = await Inventory.findById(inventory._id)
    .select("+deductedOrderIds +orderDeductions");
  assert.equal(inventoryAfter.qty, 3);
  assert.deepEqual(inventoryAfter.deductedOrderIds.map(String), [firstBody.order._id]);
  assert.deepEqual(
    inventoryAfter.orderDeductions.map((entry) => ({
      orderId: String(entry.orderId),
      quantity: entry.quantity,
    })),
    [{ orderId: firstBody.order._id, quantity: 2 }]
  );

  // Simula una caída justo después de Order.create: el retry desde otro turno
  // debe completar inventario y conservar al cajero original.
  const recoveryId = `ci-pos-security:${Date.now()}:recovery`;
  const recoveryInventory = await Inventory.create({
    item: `CI Security Coca-Zero ${Date.now()}`,
    unit: "porción",
    qty: 1,
    minQty: 0,
    menuKeys: ["coca_zero"],
  });
  const stagedOrder = await Order.create({
    staffId: staffFixtures.cashier._id,
    clientOrderId: recoveryId,
    items: [{ catalogId: "coca-zero", name: "Coca-Zero", price: 30, qty: 1 }],
    customer: "Venta interrumpida CI",
    paymentMethod: "cash",
    paymentStatus: "paid",
    source: "pos",
    subtotal: 30,
    total: 30,
    status: "pending",
  });
  const recovered = await staffRequest("manager", "/api/staff/orders", {
    method: "POST",
    body: { ...payload, clientOrderId: recoveryId },
  });
  assert.equal(recovered.status, 200);
  const recoveredBody = await recovered.json();
  assert.equal(recoveredBody.order._id, String(stagedOrder._id));
  assert.equal(recoveredBody.order.staffId, String(staffFixtures.cashier._id));
  const recoveredInventory = await Inventory.findById(recoveryInventory._id).select("+deductedOrderIds");
  assert.equal(recoveredInventory.qty, 0);
  assert.deepEqual(recoveredInventory.deductedOrderIds.map(String), [String(stagedOrder._id)]);

  const unknownProduct = await staffRequest("cashier", "/api/staff/orders", {
    method: "POST",
    body: {
      clientOrderId: `ci-pos-security:${Date.now()}:unknown`,
      items: [{ id: 999, name: "Coca-Zero", price: 1, qty: 1 }],
    },
  });
  assert.equal(unknownProduct.status, 400);

  const originalSettings = await StoreSettings.findOne({ key: "main" }).lean();
  const unavailableClientOrderId = `ci-pos-security:${Date.now()}:unavailable`;
  try {
    await StoreSettings.findOneAndUpdate(
      { key: "main" },
      { $set: { unavailableItems: ["coca-zero"] } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const stalePos = await staffRequest("cashier", "/api/staff/orders", {
      method: "POST",
      body: {
        clientOrderId: unavailableClientOrderId,
        items: [{ catalogId: "coca-zero", qty: 1 }],
        paymentMethod: "cash",
      },
    });
    assert.equal(stalePos.status, 409);
    assert.deepEqual((await stalePos.json()).unavailableItems, ["coca-zero"]);
    assert.equal(await Order.exists({ clientOrderId: unavailableClientOrderId }), null);
  } finally {
    await StoreSettings.findOneAndUpdate(
      { key: "main" },
      { $set: { unavailableItems: originalSettings?.unavailableItems ?? [] } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
});

test("el premio de Choco Rice Cake exige un bowl y el producto en la orden, y revierte al cancelar", async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const rewardCode = `CIPOSSNACK${suffix}`;
  const redemption = await Redemption.create({
    rewardId: 2,
    rewardName: "Choco Rice Cake",
    pointsCost: 100,
    code: rewardCode,
    status: "active",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const withoutBowl = await staffRequest("cashier", "/api/staff/orders", {
    method: "POST",
    body: {
      clientOrderId: `ci-pos-security:${suffix}:snack-no-bowl`,
      rewardCode,
      paymentMethod: "cash",
      items: [{ catalogId: "choco-rice-cake", qty: 1 }],
    },
  });
  assert.equal(withoutBowl.status, 400);
  assert.equal((await Redemption.findById(redemption._id)).status, "active");

  const withoutSnack = await staffRequest("cashier", "/api/staff/orders", {
    method: "POST",
    body: {
      clientOrderId: `ci-pos-security:${suffix}:snack-missing`,
      rewardCode,
      paymentMethod: "cash",
      items: [{ catalogId: "bowl-emerald-salmon", qty: 1 }],
    },
  });
  assert.equal(withoutSnack.status, 400);
  assert.match((await withoutSnack.json()).message, /Agrega el Choco Rice Cake/);
  assert.equal((await Redemption.findById(redemption._id)).status, "active");

  const created = await staffRequest("cashier", "/api/staff/orders", {
    method: "POST",
    body: {
      clientOrderId: `ci-pos-security:${suffix}:snack-ok`,
      rewardCode,
      paymentMethod: "cash",
      items: [
        { catalogId: "bowl-emerald-salmon", qty: 1 },
        { catalogId: "choco-rice-cake", qty: 1 },
      ],
    },
  });
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(body.order.discountAmount, 35);
  assert.equal(body.order.total, 230);
  assert.equal((await Redemption.findById(redemption._id)).status, "used");

  const cancelled = await staffRequest("cashier", `/api/staff/orders/${body.order._id}/status`, {
    method: "PATCH",
    body: { status: "cancelled" },
  });
  assert.equal(cancelled.status, 200);
  assert.equal((await Redemption.findById(redemption._id)).status, "active");
});

test("cancelar una venta POS revierte inventario, puntos y premio una sola vez", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const customer = await User.create({
    name: "Cliente cancelaciÃ³n POS CI",
    email: `ci-pos-security-${suffix}@example.test`,
    password: "hash-no-usado-en-esta-prueba",
  });
  const rewardCode = `CIPOS${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const redemption = await Redemption.create({
    user: customer._id,
    rewardId: 1,
    rewardName: "Bebida gratis",
    pointsCost: 50,
    code: rewardCode,
    status: "active",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const inventory = await Inventory.create({
    item: `CI Security Agua del Dia ${Date.now()}`,
    unit: "porciÃ³n",
    qty: 2,
    minQty: 0,
    menuKeys: ["agua_natural"],
  });
  const clientOrderId = `ci-pos-security:${Date.now()}:cancel`;

  const created = await staffRequest("cashier", "/api/staff/orders", {
    method: "POST",
    body: {
      clientOrderId,
      customerUserId: String(customer._id),
      rewardCode,
      paymentMethod: "cash",
      items: [
        { catalogId: "bowl-emerald-salmon", qty: 1 },
        { catalogId: "agua-del-dia", qty: 1 },
      ],
    },
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  const orderId = createdBody.order._id;
  assert.equal(createdBody.order.total, 230);
  assert.equal((await Inventory.findById(inventory._id)).qty, 1);
  assert.equal((await User.findById(customer._id)).points, 23);
  assert.equal((await Redemption.findById(redemption._id)).status, "used");

  const movementsAfterSale = await InventoryMovement.find({ itemId: inventory._id }).sort({ createdAt: 1 });
  assert.equal(movementsAfterSale.length, 1);
  assert.equal(movementsAfterSale[0].type, "sale_deduction");
  assert.equal(movementsAfterSale[0].delta, -1);
  assert.equal(movementsAfterSale[0].qtyBefore, 2);
  assert.equal(movementsAfterSale[0].qtyAfter, 1);
  assert.equal(movementsAfterSale[0].reference, orderId);
  assert.equal(movementsAfterSale[0].actorName, "CI cashier");

  const cancelled = await staffRequest("cashier", `/api/staff/orders/${orderId}/status`, {
    method: "PATCH",
    body: { status: "cancelled" },
  });
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).order.status, "cancelled");

  let inventoryAfter = await Inventory.findById(inventory._id)
    .select("+deductedOrderIds +processedOrderIds");
  let customerAfter = await User.findById(customer._id)
    .select("+loyaltyCreditedOrderIds +cancelledPosCreditsReversed");
  let rewardAfter = await Redemption.findById(redemption._id);
  assert.equal(inventoryAfter.qty, 2);
  assert.deepEqual(inventoryAfter.deductedOrderIds, []);
  assert.deepEqual(inventoryAfter.processedOrderIds, []);
  assert.equal(customerAfter.points, 0);
  assert.equal(customerAfter.lifetimePoints, 0);
  assert.deepEqual(customerAfter.loyaltyCreditedOrderIds, []);
  assert.deepEqual(customerAfter.cancelledPosCreditsReversed.map(String), [orderId]);
  assert.equal(rewardAfter.status, "active");
  assert.equal(rewardAfter.order, undefined);

  const movementsAfterCancel = await InventoryMovement.find({ itemId: inventory._id }).sort({ createdAt: 1 });
  assert.equal(movementsAfterCancel.length, 2);
  assert.equal(movementsAfterCancel[1].type, "sale_reversal");
  assert.equal(movementsAfterCancel[1].delta, 1);
  assert.equal(movementsAfterCancel[1].qtyBefore, 1);
  assert.equal(movementsAfterCancel[1].qtyAfter, 2);
  assert.equal(movementsAfterCancel[1].reference, orderId);

  const retried = await staffRequest("cashier", `/api/staff/orders/${orderId}/status`, {
    method: "PATCH",
    body: { status: "cancelled" },
  });
  assert.equal(retried.status, 200);
  assert.equal((await retried.json()).idempotent, true);
  assert.equal((await staffRequest("cashier", `/api/staff/orders/${orderId}/status`, {
    method: "PATCH",
    body: { status: "pending" },
  })).status, 409);

  inventoryAfter = await Inventory.findById(inventory._id);
  customerAfter = await User.findById(customer._id);
  rewardAfter = await Redemption.findById(redemption._id);
  assert.equal(inventoryAfter.qty, 2);
  assert.equal(customerAfter.points, 0);
  assert.equal(customerAfter.lifetimePoints, 0);
  assert.equal(rewardAfter.status, "active");

  // La cancelación repetida (idempotente) no debe duplicar el ledger.
  const movementsFinal = await InventoryMovement.find({ itemId: inventory._id });
  assert.equal(movementsFinal.length, 2);
});

test("el monitor de errores acepta reportes", async () => {
  const r = await postJSON("/api/monitor/error", {
    message: "error de prueba CI",
    url: "http://ci.test",
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
});


test("cobrar registra el metodo de pago y rechaza metodos desconocidos", async () => {
  const created = await postCustomerOrder({
    cart: [{ base: "white_rice", proteins: ["salmon"] }],
    customer: "Cobro con metodo CI",
    phone: "6630000042",
    scheduledPickupTime: tomorrowAt15(),
  }, "pay-method");
  assert.equal(created.status, 201);
  const orderId = (await created.json()).order._id;

  const paid = await fetch(`${BASE}/api/staff/orders/${orderId}/pay`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${staffTokens.cashier}` },
    body: JSON.stringify({ method: "cash" }),
  });
  assert.equal(paid.status, 200);
  const paidBody = await paid.json();
  assert.equal(paidBody.order.paymentStatus, "paid");
  assert.equal(paidBody.order.paymentMethod, "cash");

  // Un metodo desconocido no debe corromper el registro: se ignora y el
  // metodo original de la orden se conserva.
  const other = await postCustomerOrder({
    cart: [{ base: "white_rice", proteins: ["salmon"] }],
    customer: "Cobro metodo invalido CI",
    phone: "6630000043",
    scheduledPickupTime: tomorrowAt15(),
  }, "pay-method-invalid");
  assert.equal(other.status, 201);
  const otherId = (await other.json()).order._id;

  const weird = await fetch(`${BASE}/api/staff/orders/${otherId}/pay`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${staffTokens.cashier}` },
    body: JSON.stringify({ method: "bitcoin" }),
  });
  assert.equal(weird.status, 200);
  const weirdBody = await weird.json();
  assert.equal(weirdBody.order.paymentStatus, "paid");
  assert.equal(weirdBody.order.paymentMethod, "pay_at_pickup");
});

test("el dueno puede marcar entrada y salida sin GPS; un empleado sin coordenadas no", async () => {
  const ownerIn = await staffRequest("owner", "/api/kiosk/time/clock-in", {
    method: "POST",
    body: { locationId: "main" },
  });
  assert.equal(ownerIn.status, 201);

  const ownerOut = await staffRequest("owner", "/api/kiosk/time/clock-out", {
    method: "POST",
    body: {},
  });
  assert.equal(ownerOut.status, 200);

  const employeeIn = await staffRequest("employee", "/api/kiosk/time/clock-in", {
    method: "POST",
    body: { locationId: "main" },
  });
  assert.equal(employeeIn.status, 403);

  const employeeFar = await staffRequest("employee", "/api/kiosk/time/clock-in", {
    method: "POST",
    body: { locationId: "main", lat: 32.5327, lng: -117.0182 },
  });
  assert.equal(employeeFar.status, 403);
});

test("el restock individual y por lote registran el movimiento correcto, sin duplicar en reintento", async () => {
  const single = await Inventory.create({
    item: `CI Security Restock Individual ${Date.now()}`,
    unit: "kg", qty: 5, minQty: 0,
  });
  const batchItem = await Inventory.create({
    item: `CI Security Restock Lote ${Date.now()}`,
    unit: "kg", qty: 3, minQty: 0,
  });

  const restocked = await staffRequest("manager", `/api/staff/inventory/${single._id}/restock`, {
    method: "PATCH",
    body: { amount: 2, registerExpense: false },
  });
  assert.equal(restocked.status, 200);

  const singleMovements = await InventoryMovement.find({ itemId: single._id });
  assert.equal(singleMovements.length, 1);
  assert.equal(singleMovements[0].type, "restock");
  assert.equal(singleMovements[0].delta, 2);
  assert.equal(singleMovements[0].qtyBefore, 5);
  assert.equal(singleMovements[0].qtyAfter, 7);
  assert.equal(singleMovements[0].actorName, "CI manager");

  const requestId = `ci-security-batch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const batchBody = {
    requestId,
    lines: [{ itemId: String(batchItem._id), amount: 4 }],
    registerExpense: false,
  };
  const batch = await staffRequest("manager", "/api/staff/inventory/restock-batch", {
    method: "POST", body: batchBody,
  });
  assert.equal(batch.status, 200);
  assert.equal((await batch.json()).replayed, false);

  const batchMovements = await InventoryMovement.find({ itemId: batchItem._id });
  assert.equal(batchMovements.length, 1);
  assert.equal(batchMovements[0].type, "restock_batch");
  assert.equal(batchMovements[0].delta, 4);
  assert.equal(batchMovements[0].qtyBefore, 3);
  assert.equal(batchMovements[0].qtyAfter, 7);
  assert.equal(batchMovements[0].reference, requestId);
  assert.equal(batchMovements[0].referenceType, "restockRequest");

  // Reintentar el mismo folio no debe volver a sumar cantidad ni duplicar el ledger.
  const replay = await staffRequest("manager", "/api/staff/inventory/restock-batch", {
    method: "POST", body: batchBody,
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).replayed, true);
  assert.equal((await Inventory.findById(batchItem._id)).qty, 7);
  assert.equal((await InventoryMovement.find({ itemId: batchItem._id })).length, 1);
});

test("crear, editar y borrar un articulo separan AuditLog (campos) de InventoryMovement (cantidad)", async () => {
  const created = await staffRequest("manager", "/api/staff/inventory", {
    method: "POST",
    body: { item: `CI Security Alta ${Date.now()}`, unit: "kg", qty: 3, minQty: 1, cost: 10 },
  });
  assert.equal(created.status, 201);
  const item = (await created.json()).item;

  const movementsOnCreate = await InventoryMovement.find({ itemId: item._id });
  assert.equal(movementsOnCreate.length, 1);
  assert.equal(movementsOnCreate[0].type, "manual_adjustment");
  assert.equal(movementsOnCreate[0].qtyBefore, 0);
  assert.equal(movementsOnCreate[0].qtyAfter, 3);

  const auditOnCreate = await AuditLog.find({ entity: "Inventory", entityId: item._id, action: "create" });
  assert.equal(auditOnCreate.length, 1);

  // Editar un campo que no es qty: solo AuditLog, ningun movimiento nuevo.
  const editedCost = await staffRequest("manager", `/api/staff/inventory/${item._id}`, {
    method: "PATCH", body: { cost: 15 },
  });
  assert.equal(editedCost.status, 200);
  assert.equal((await InventoryMovement.find({ itemId: item._id })).length, 1);
  const auditOnCostUpdate = await AuditLog.find({ entity: "Inventory", entityId: item._id, action: "update" });
  assert.equal(auditOnCostUpdate.length, 1);
  assert.deepEqual(auditOnCostUpdate[0].changes.map((c) => c.field), ["cost"]);
  assert.equal(auditOnCostUpdate[0].changes[0].oldValue, 10);
  assert.equal(auditOnCostUpdate[0].changes[0].newValue, 15);

  // Editar qty directo: solo InventoryMovement, ningun AuditLog nuevo (qty
  // nunca aparece en los cambios de AuditLog, vive solo en el ledger).
  const editedQty = await staffRequest("manager", `/api/staff/inventory/${item._id}`, {
    method: "PATCH", body: { qty: 9 },
  });
  assert.equal(editedQty.status, 200);
  const movementsAfterQtyEdit = await InventoryMovement.find({ itemId: item._id }).sort({ createdAt: 1 });
  assert.equal(movementsAfterQtyEdit.length, 2);
  assert.equal(movementsAfterQtyEdit[1].type, "manual_adjustment");
  assert.equal(movementsAfterQtyEdit[1].delta, 6);
  assert.equal((await AuditLog.find({ entity: "Inventory", entityId: item._id, action: "update" })).length, 1);

  // Borrar: AuditLog captura el estado final, no queda huerfano sin rastro.
  const deleted = await staffRequest("manager", `/api/staff/inventory/${item._id}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  const auditOnDelete = await AuditLog.find({ entity: "Inventory", entityId: item._id, action: "delete" });
  assert.equal(auditOnDelete.length, 1);
  const qtyChange = auditOnDelete[0].changes.find((c) => c.field === "qty");
  assert.equal(qtyChange.oldValue, 9);
  assert.equal(qtyChange.newValue, null);

  await AuditLog.deleteMany({ entity: "Inventory", entityId: item._id });
  await InventoryMovement.deleteMany({ itemId: item._id });
});

test("GET movimientos y audit-log filtran por articulo/entidad y protegen por rol", async () => {
  const touched = await Inventory.create({
    item: `CI Security Movimientos ${Date.now()}`, unit: "kg", qty: 0, minQty: 0,
  });
  const untouched = await Inventory.create({
    item: `CI Security Sin Tocar ${Date.now()}`, unit: "kg", qty: 0, minQty: 0,
  });

  await staffRequest("manager", `/api/staff/inventory/${touched._id}/restock`, {
    method: "PATCH", body: { amount: 1, registerExpense: false },
  });

  const movementsForTouched = await staffRequest("cashier", `/api/staff/inventory/${touched._id}/movements`);
  assert.equal(movementsForTouched.status, 200);
  const touchedBody = await movementsForTouched.json();
  assert.equal(touchedBody.movements.length, 1);
  assert.equal(touchedBody.movements[0].itemId, String(touched._id));

  // Un articulo que nunca se ha tocado no es un error, solo lista vacia.
  const movementsForUntouched = await staffRequest("cashier", `/api/staff/inventory/${untouched._id}/movements`);
  assert.equal(movementsForUntouched.status, 200);
  assert.deepEqual((await movementsForUntouched.json()).movements, []);

  const auditAsManager = await staffRequest("manager", `/api/staff/audit-log?entity=Inventory&entityId=${touched._id}`);
  assert.equal(auditAsManager.status, 200);

  const auditAsCashier = await staffRequest("cashier", "/api/staff/audit-log");
  assert.equal(auditAsCashier.status, 403);
});
