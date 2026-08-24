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
// (dentro del horario 11-21 sin importar a qué hora corra el CI).
function tomorrowAt15() {
  const tomorrowKey = nextDateKey(dateKeyInTimeZone());
  const [year, month, day] = tomorrowKey.split("-").map(Number);
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

test("la lista de clientes muestra registros sin exponer contraseñas", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `ci-pos-security-customer-${suffix}@example.test`;
  const customer = await User.create({
    name: "Cliente visible CI",
    email,
    password: "hash-que-no-debe-salir",
    phone: "6630000044",
    points: 25,
    lifetimePoints: 50,
  });
  const countedOrders = await Order.create([
    {
      user: customer._id,
      customer: customer.name,
      paymentStatus: "paid",
      status: "completed",
      total: 230,
      source: "online",
      createdAt: new Date("2026-01-01T12:00:00.000Z"),
    },
    {
      user: customer._id,
      customer: customer.name,
      paymentStatus: "paid",
      status: "ready",
      total: 80,
      source: "pos",
      createdAt: new Date("2026-01-02T12:00:00.000Z"),
    },
    {
      user: customer._id,
      customer: customer.name,
      paymentStatus: "paid",
      status: "cancelled",
      total: 999,
      source: "pos",
    },
    {
      user: customer._id,
      customer: customer.name,
      paymentStatus: "pending",
      status: "pending",
      total: 150,
      source: "online",
    },
  ]);

  try {
    const ownerResponse = await staffRequest(
      "owner",
      `/api/staff/customers?q=${encodeURIComponent(email)}&limit=10`
    );
    assert.equal(ownerResponse.status, 200);
    const body = await ownerResponse.json();
    const listed = body.customers.find((entry) => entry._id === String(customer._id));
    assert.ok(listed);
    assert.equal(listed.email, email);
    assert.equal(listed.password, undefined);
    assert.equal(listed.purchaseCount, 2);
    assert.equal(listed.totalSpent, 310);
    assert.equal(new Date(listed.lastPurchaseAt).getTime(), countedOrders[1].createdAt.getTime());
    assert.equal(body.pagination.total, 1);

    const cashierResponse = await staffRequest("cashier", "/api/staff/customers");
    assert.equal(cashierResponse.status, 403);
  } finally {
    await Order.deleteMany({ _id: { $in: countedOrders.map((order) => order._id) } });
    await User.findByIdAndDelete(customer._id);
  }
});

test("crear orden valida: el precio lo pone el servidor, no el cliente", async () => {
  const attempt = customerAttempt("price");
  const r = await postJSON("/api/orders", {
    base: "white_rice",
    proteins: ["salmon"],
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
      base: "white_rice",
      proteins: ["salmon", "tuna"],
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
    base: "white_rice",
    proteins: ["salmon"],
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
    base: "white_rice",
    proteins: ["salmon"],
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
      base: "white_rice",
      proteins: ["salmon"],
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
      base: "white_rice",
      proteins: ["salmon"],
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
    base: "white_rice",
    proteins: ["salmon", "tuna", "shrimp", "tofu"],
    customer: "Prueba CI",
    phone: "6630000000",
    scheduledPickupTime: tomorrowAt15(),
  }, "too-many-proteins");
  assert.equal(r.status, 400);
});

test("orden sin nombre/telefono se rechaza", async () => {
  const r = await postCustomerOrder({
    base: "white_rice",
    proteins: ["salmon"],
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
    body: { items: [{ catalogId: "edamame", qty: 1 }] },
  })).status, 403);
});

test("el POS calcula catálogo, deduplica reintentos y descuenta inventario una vez", async () => {
  const clientOrderId = `ci-pos-security:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const inventory = await Inventory.create({
    item: `CI Security Edamame ${Date.now()}`,
    unit: "porción",
    qty: 5,
    minQty: 0,
    menuKeys: ["edamame"],
  });
  const payload = {
    clientOrderId,
    items: [{ catalogId: "edamame", name: "Artículo manipulado", price: 0.01, qty: 2 }],
    customer: "Mostrador CI",
    phone: "6630000001",
    fulfillment: "pickup",
    paymentMethod: "cash",
  };

  const created = await staffRequest("cashier", "/api/staff/orders", { method: "POST", body: payload });
  assert.equal(created.status, 201);
  const firstBody = await created.json();
  assert.equal(firstBody.order.subtotal, 138);
  assert.equal(firstBody.order.total, 138);
  assert.equal(firstBody.order.items[0].name, "Edamame");
  assert.equal(firstBody.order.items[0].price, 69);

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
    item: `CI Security Edamame ${Date.now()}`,
    unit: "porción",
    qty: 1,
    minQty: 0,
    menuKeys: ["edamame"],
  });
  const stagedOrder = await Order.create({
    staffId: staffFixtures.cashier._id,
    clientOrderId: recoveryId,
    items: [{ catalogId: "edamame", name: "Edamame", price: 69, qty: 1 }],
    customer: "Venta interrumpida CI",
    paymentMethod: "cash",
    paymentStatus: "paid",
    source: "pos",
    subtotal: 69,
    total: 69,
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
  await Inventory.deleteMany({ _id: { $in: [inventory._id, recoveryInventory._id] } });

  const unknownProduct = await staffRequest("cashier", "/api/staff/orders", {
    method: "POST",
    body: {
      clientOrderId: `ci-pos-security:${Date.now()}:unknown`,
      items: [{ id: 999, name: "Edamame", price: 1, qty: 1 }],
    },
  });
  assert.equal(unknownProduct.status, 400);

  const originalSettings = await StoreSettings.findOne({ key: "main" }).lean();
  const unavailableClientOrderId = `ci-pos-security:${Date.now()}:unavailable`;
  try {
    await StoreSettings.findOneAndUpdate(
      { key: "main" },
      { $set: { unavailableItems: ["edamame"] } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const stalePos = await staffRequest("cashier", "/api/staff/orders", {
      method: "POST",
      body: {
        clientOrderId: unavailableClientOrderId,
        items: [{ catalogId: "edamame", qty: 1 }],
        paymentMethod: "cash",
      },
    });
    assert.equal(stalePos.status, 409);
    assert.deepEqual((await stalePos.json()).unavailableItems, ["edamame"]);
    assert.equal(await Order.exists({ clientOrderId: unavailableClientOrderId }), null);
  } finally {
    await StoreSettings.findOneAndUpdate(
      { key: "main" },
      { $set: { unavailableItems: originalSettings?.unavailableItems ?? [] } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
});

test("el premio de topping extra deja una instrucción verificable para cocina", async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const rewardCode = `CIPOSTOP${suffix}`;
  const redemption = await Redemption.create({
    rewardId: 2,
    rewardName: "Topping extra",
    pointsCost: 75,
    code: rewardCode,
    status: "active",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const toppingInventory = await Inventory.create({
    item: `CI Security Masago ${suffix}`,
    unit: "porción",
    qty: 3,
    minQty: 0,
    menuKeys: ["masago"],
  });

  const withoutBowl = await staffRequest("cashier", "/api/staff/orders", {
    method: "POST",
    body: {
      clientOrderId: `ci-pos-security:${suffix}:topping-no-bowl`,
      rewardCode,
      rewardTopping: "masago",
      paymentMethod: "cash",
      items: [{ catalogId: "edamame", qty: 1 }],
    },
  });
  assert.equal(withoutBowl.status, 400);
  assert.equal((await Redemption.findById(redemption._id)).status, "active");

  const withoutSelection = await staffRequest("cashier", "/api/staff/orders", {
    method: "POST",
    body: {
      clientOrderId: `ci-pos-security:${suffix}:topping-no-selection`,
      rewardCode,
      paymentMethod: "cash",
      base: "white_rice",
      proteins: ["tuna", "salmon"],
    },
  });
  assert.equal(withoutSelection.status, 400);
  assert.match((await withoutSelection.json()).message, /Selecciona el topping extra/);
  assert.equal((await Redemption.findById(redemption._id)).status, "active");

  const created = await staffRequest("cashier", "/api/staff/orders", {
    method: "POST",
    body: {
      clientOrderId: `ci-pos-security:${suffix}:topping-ok`,
      rewardCode,
      rewardTopping: "masago",
      paymentMethod: "cash",
      notes: "Sin cebolla",
      base: "white_rice",
      proteins: ["tuna", "salmon"],
      toppings: ["masago"],
    },
  });
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(body.order.discountAmount, 0);
  assert.equal(body.order.rewardExtraTopping, "masago");
  assert.match(body.order.notes, /Sin cebolla/);
  assert.match(body.order.notes, /PREMIO REWARDS: agregar 1 porción extra de Masago/);
  assert.equal((await Redemption.findById(redemption._id)).status, "used");
  assert.equal((await Inventory.findById(toppingInventory._id)).qty, 1);

  const cancelled = await staffRequest("cashier", `/api/staff/orders/${body.order._id}/status`, {
    method: "PATCH",
    body: { status: "cancelled" },
  });
  assert.equal(cancelled.status, 200);
  const restoredInventory = await Inventory.findById(toppingInventory._id)
    .select("+deductedOrderIds +processedOrderIds +orderDeductions");
  assert.equal(restoredInventory.qty, 3);
  assert.deepEqual(restoredInventory.deductedOrderIds, []);
  assert.deepEqual(restoredInventory.processedOrderIds, []);
  assert.deepEqual(restoredInventory.orderDeductions, []);
  assert.equal((await Redemption.findById(redemption._id)).status, "active");
});

test("los pedidos programados entran a KDS y al tiempo de espera solo 30 minutos antes", async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const baselineResponse = await fetch(`${BASE}/api/orders/wait-time`);
  assert.equal(baselineResponse.status, 200);
  const baseline = await baselineResponse.json();

  const farOrder = await Order.create({
    clientOrderId: `ci-web:schedule-far:${suffix}`,
    customer: `CI Programada Lejana ${suffix}`,
    source: "online",
    status: "pending",
    isScheduled: true,
    scheduledPickupTime: new Date(Date.now() + 31 * 60 * 1000),
    subtotal: 230,
    total: 230,
  });

  const afterFarResponse = await fetch(`${BASE}/api/orders/wait-time`);
  assert.equal(afterFarResponse.status, 200);
  assert.equal((await afterFarResponse.json()).activeOrders, baseline.activeOrders);

  const kitchenBefore = await staffRequest(
    "kitchen",
    "/api/staff/orders?status=pending,preparing,ready"
  );
  assert.equal(kitchenBefore.status, 200);
  assert.equal(
    (await kitchenBefore.json()).orders.some((order) => order._id === String(farOrder._id)),
    false
  );

  const nearOrder = await Order.create({
    clientOrderId: `ci-web:schedule-near:${suffix}`,
    customer: `CI Programada Cercana ${suffix}`,
    source: "online",
    status: "pending",
    isScheduled: true,
    scheduledPickupTime: new Date(Date.now() + 29 * 60 * 1000),
    subtotal: 230,
    total: 230,
  });

  const afterNearResponse = await fetch(`${BASE}/api/orders/wait-time`);
  assert.equal(afterNearResponse.status, 200);
  assert.equal((await afterNearResponse.json()).activeOrders, baseline.activeOrders + 1);

  for (const role of ["kitchen", "manager"]) {
    const activeOrders = await staffRequest(
      role,
      "/api/staff/orders?status=pending,preparing,ready"
    );
    assert.equal(activeOrders.status, 200);
    const visibleIds = (await activeOrders.json()).orders.map((order) => order._id);
    assert.equal(visibleIds.includes(String(farOrder._id)), false);
    assert.equal(visibleIds.includes(String(nearOrder._id)), true);
  }
});

test("el cobro con stock insuficiente conserva la orden sin pagar y no recorta existencias", async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const itemName = `CIShortage${suffix}`;
  const inventory = await Inventory.create({
    item: `CI Security Shortage ${suffix}`,
    unit: "porción",
    qty: 1,
    minQty: 0,
    menuKeys: [itemName.toLowerCase()],
  });
  const order = await Order.create({
    clientOrderId: `ci-pos-security:${suffix}:shortage-pay`,
    items: [{ name: itemName, price: 10, qty: 2 }],
    customer: "Stock insuficiente CI",
    source: "pos",
    status: "pending",
    paymentMethod: "pay_at_pickup",
    paymentStatus: "pending",
    subtotal: 20,
    total: 20,
  });

  const paid = await staffRequest("cashier", `/api/staff/orders/${order._id}/pay`, {
    method: "PATCH",
    body: { method: "cash" },
  });
  assert.equal(paid.status, 409);
  const body = await paid.json();
  assert.equal(body.code, "INSUFFICIENT_STOCK");
  assert.deepEqual(body.shortages.map(({ required, available }) => ({ required, available })), [
    { required: 2, available: 1 },
  ]);

  const [orderAfter, inventoryAfter] = await Promise.all([
    Order.findById(order._id),
    Inventory.findById(inventory._id).select("+processedOrderIds +orderDeductions"),
  ]);
  assert.equal(orderAfter.paymentStatus, "pending");
  assert.equal(orderAfter.paymentMethod, "pay_at_pickup");
  assert.equal(inventoryAfter.qty, 1);
  assert.deepEqual(inventoryAfter.processedOrderIds, []);
  assert.deepEqual(inventoryAfter.orderDeductions, []);

  await Order.updateOne({ _id: order._id }, { $set: { status: "ready" } });
  const completed = await staffRequest("cashier", `/api/staff/orders/${order._id}/status`, {
    method: "PATCH",
    body: { status: "completed" },
  });
  assert.equal(completed.status, 409);
  const afterCompletionAttempt = await Order.findById(order._id);
  assert.equal(afterCompletionAttempt.status, "ready");
  assert.equal(afterCompletionAttempt.paymentStatus, "pending");
  assert.equal((await Inventory.findById(inventory._id)).qty, 1);
});

test("el POS no conserva una venta provisional cuando un producto rastreado está agotado", async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const clientOrderId = `ci-pos-security:${suffix}:sold-out`;
  const inventory = await Inventory.create({
    item: `CI Security Bottled Water ${suffix}`,
    unit: "unidad",
    qty: 0,
    minQty: 0,
    menuKeys: ["botella_de_agua"],
  });

  const created = await staffRequest("cashier", "/api/staff/orders", {
    method: "POST",
    body: {
      clientOrderId,
      paymentMethod: "cash",
      items: [{ catalogId: "bottled-water", qty: 1 }],
    },
  });
  assert.equal(created.status, 409);
  assert.equal((await created.json()).code, "INSUFFICIENT_STOCK");
  assert.equal(await Order.exists({ clientOrderId }), null);

  const inventoryAfter = await Inventory.findById(inventory._id)
    .select("+processedOrderIds +deductedOrderIds +orderDeductions");
  assert.equal(inventoryAfter.qty, 0);
  assert.deepEqual(inventoryAfter.processedOrderIds, []);
  assert.deepEqual(inventoryAfter.deductedOrderIds, []);
  assert.deepEqual(inventoryAfter.orderDeductions, []);
});

test("proteína doble cobra y descuenta una porción real y la deja visible para cocina", async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const rewardCode = `CIPOSDOUBLE${suffix}`;
  const redemption = await Redemption.create({
    rewardId: 4,
    rewardName: "Proteína doble",
    pointsCost: 200,
    code: rewardCode,
    status: "active",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const missingScoop = await staffRequest("cashier", "/api/staff/orders", {
    method: "POST",
    body: {
      clientOrderId: `ci-pos-security:${suffix}:double-missing`,
      rewardCode,
      paymentMethod: "cash",
      base: "white_rice",
      proteins: ["tuna", "salmon", "tofu"],
    },
  });
  assert.equal(missingScoop.status, 400);
  assert.equal((await Redemption.findById(redemption._id)).status, "active");

  const created = await staffRequest("cashier", "/api/staff/orders", {
    method: "POST",
    body: {
      clientOrderId: `ci-pos-security:${suffix}:double-ok`,
      rewardCode,
      paymentMethod: "cash",
      base: "white_rice",
      proteins: ["tuna", "salmon", "tofu"],
      extraScoopProteins: ["salmon"],
    },
  });
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(body.order.bowlSize, "large");
  assert.equal(body.order.subtotal, 290);
  assert.equal(body.order.discountAmount, 40);
  assert.equal(body.order.total, 250);
  assert.deepEqual(body.order.extraScoopProteins, ["salmon"]);
  assert.match(body.order.notes, /PREMIO REWARDS: agregar 1 porción extra de Salmón/);
  assert.equal((await Redemption.findById(redemption._id)).status, "used");
});

test("bowl gratis usa la categoría del catálogo aunque el producto no incluya Bowl en el nombre", async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const rewardCode = `CIPOSFREEBOWL${suffix}`;
  await Redemption.create({
    rewardId: 3,
    rewardName: "Bowl gratis",
    pointsCost: 300,
    code: rewardCode,
    status: "active",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  // legacyId 4 remains the fourth house bowl even if its display name changes.
  const created = await staffRequest("cashier", "/api/staff/orders", {
    method: "POST",
    body: {
      clientOrderId: `ci-pos-security:${suffix}:free-bowl-category`,
      rewardCode,
      paymentMethod: "cash",
      items: [{ id: 4, qty: 1 }],
    },
  });
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(body.order.items[0].category, "bowls");
  assert.doesNotMatch(body.order.items[0].name, /bowl/i);
  assert.equal(body.order.discountAmount, 230);
  assert.equal(body.order.total, 0);
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
    base: "white_rice",
    proteins: ["salmon"],
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
    base: "white_rice",
    proteins: ["salmon"],
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
