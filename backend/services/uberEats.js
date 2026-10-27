import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import Order from "../models/Order.js";
import StoreSettings from "../models/StoreSettings.js";
import ExternalWebhookEvent from "../models/ExternalWebhookEvent.js";
import { restoreInventoryForOrder } from "./orderInventory.js";

const NEW_ORDER_EVENTS = new Set(["orders.notification", "orders.scheduled.notification"]);
const CANCEL_EVENTS = new Set(["orders.cancel", "orders.failure"]);
const REFRESH_EVENTS = new Set(["order.fulfillment_issues.resolved"]);
const MAX_ATTEMPTS = 8;

let cachedToken = null;
let tokenExpiresAt = 0;
let queueRunning = false;
let workerTimer = null;

const clip = (value, max) => String(value ?? "").trim().slice(0, max);
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function getUberEatsConfig(env = process.env) {
  const environment = String(env.UBER_EATS_ENV || "sandbox").toLowerCase() === "production"
    ? "production"
    : "sandbox";
  return {
    environment,
    clientId: String(env.UBER_EATS_CLIENT_ID || "").trim(),
    clientSecret: String(env.UBER_EATS_CLIENT_SECRET || "").trim(),
    autoAccept: String(env.UBER_EATS_AUTO_ACCEPT || "").toLowerCase() === "true",
    tokenUrl: environment === "production"
      ? "https://auth.uber.com/oauth/v2/token"
      : "https://sandbox-login.uber.com/oauth/v2/token",
    apiBase: environment === "production"
      ? "https://api.uber.com"
      : "https://test-api.uber.com",
  };
}

export function getUberEatsWebhookSecret(env = process.env) {
  return String(env.UBER_EATS_WEBHOOK_SECRET || env.UBER_EATS_CLIENT_SECRET || "").trim();
}

function requireConfig() {
  const config = getUberEatsConfig();
  if (!config.clientId || !config.clientSecret) {
    const error = new Error("Faltan UBER_EATS_CLIENT_ID o UBER_EATS_CLIENT_SECRET");
    error.code = "UBER_NOT_CONFIGURED";
    throw error;
  }
  return config;
}

export function verifyUberWebhookSignature(rawBody, signature, secret = getUberEatsWebhookSecret()) {
  if (!Buffer.isBuffer(rawBody) || !signature || !secret) return false;
  const cleanSignature = String(signature).trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/.test(cleanSignature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(cleanSignature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function moneyValue(money) {
  const amount = Number(money?.amount);
  return Number.isFinite(amount) ? round2(amount / 100) : 0;
}

function itemTitle(item) {
  return clip(item?.title || item?.name || item?.id || "Producto", 180);
}

function modifierLines(item, depth = 0) {
  if (!item || depth > 4) return [];
  const lines = [];
  for (const group of Array.isArray(item.selected_modifier_groups) ? item.selected_modifier_groups : []) {
    const selected = (Array.isArray(group.selected_items) ? group.selected_items : []).map((selectedItem) => {
      const qty = Math.max(1, Number(selectedItem?.quantity) || 1);
      const nested = modifierLines(selectedItem, depth + 1);
      return `${qty > 1 ? `${qty}× ` : ""}${itemTitle(selectedItem)}${nested.length ? ` (${nested.join("; ")})` : ""}`;
    });
    if (selected.length) lines.push(`${clip(group.title || "Opción", 100)}: ${selected.join(", ")}`);

    const removed = (Array.isArray(group.removed_items) ? group.removed_items : []).map(itemTitle);
    if (removed.length) lines.push(`Sin: ${removed.join(", ")}`);
  }
  return lines;
}

function specialRequestLines(item) {
  const requests = Array.isArray(item?.special_requests) ? item.special_requests : [];
  return requests
    .map((request) => clip(
      request?.freeform_text || request?.title || request?.name || request?.type || "",
      180
    ))
    .filter(Boolean)
    .map((request) => `Solicitud: ${request}`);
}

function normalizeItem(item) {
  const qty = Math.max(1, Number(item?.quantity) || 1);
  const details = [
    ...modifierLines(item),
    ...specialRequestLines(item),
    item?.special_instructions ? `Nota: ${clip(item.special_instructions, 300)}` : "",
  ].filter(Boolean);
  return {
    name: itemTitle(item),
    qty,
    price: moneyValue(item?.price?.unit_price),
    detail: clip(details.join(" · "), 1000) || null,
    externalId: clip(item?.id, 180) || null,
    externalInstanceId: clip(item?.instance_id, 180) || null,
  };
}

function fulfillmentFor(type) {
  if (type === "PICK_UP") return "pickup";
  if (type === "DINE_IN") return "dine_in";
  return "delivery";
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeUberEatsOrder(payload, { eventType = "orders.notification" } = {}) {
  const order = payload?.order || payload;
  const externalOrderId = clip(order?.id, 128);
  if (!externalOrderId) throw new Error("Uber no devolvió el identificador del pedido");

  const items = (Array.isArray(order?.cart?.items) ? order.cart.items : []).map(normalizeItem);
  if (!items.length) throw new Error(`El pedido Uber ${externalOrderId} no contiene productos`);

  const firstName = clip(order?.eater?.first_name, 80);
  const lastName = clip(order?.eater?.last_name, 20);
  const customerName = [firstName, lastName].filter(Boolean).join(" ") || "Cliente Uber Eats";
  const displayId = clip(order?.display_id, 40);
  const orderNotes = [];
  if (order?.cart?.special_instructions) {
    orderNotes.push(clip(order.cart.special_instructions, 500));
  }
  if (order?.packaging?.disposable_items?.should_include === true) {
    orderNotes.push("Incluir cubiertos y artículos desechables");
  } else if (order?.packaging?.disposable_items?.should_include === false) {
    orderNotes.push("No incluir cubiertos ni artículos desechables");
  }

  const subtotal = moneyValue(order?.payment?.charges?.sub_total)
    || round2(items.reduce((sum, item) => sum + item.price * item.qty, 0));
  const total = moneyValue(order?.payment?.charges?.total) || subtotal;
  const tax = moneyValue(order?.payment?.charges?.tax);
  const scheduled = eventType === "orders.scheduled.notification";

  return {
    clientOrderId: `uber_eats:${externalOrderId}`,
    externalProvider: "uber_eats",
    externalOrderId,
    externalDisplayId: displayId || null,
    externalStoreId: clip(order?.store?.id, 128) || null,
    externalState: clip(order?.current_state || "CREATED", 40),
    source: "delivery",
    deliveryPlatform: "uber_eats",
    items,
    customer: displayId ? `${customerName} · UE ${displayId}` : customerName,
    phone: clip(order?.eater?.phone, 40) || null,
    notes: orderNotes.join("\n") || null,
    fulfillment: fulfillmentFor(order?.type),
    paymentMethod: "delivery_app",
    paymentStatus: "paid",
    subtotal,
    tax,
    total,
    status: "pending",
    isScheduled: scheduled,
    scheduledPickupTime: scheduled ? validDate(order?.estimated_ready_for_pickup_at) : null,
  };
}

async function getAccessToken({ forceRefresh = false } = {}) {
  const config = requireConfig();
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const form = new FormData();
  form.set("client_id", config.clientId);
  form.set("client_secret", config.clientSecret);
  form.set("grant_type", "client_credentials");
  form.set("scope", "eats.order");

  const response = await fetch(config.tokenUrl, { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(`Uber OAuth respondió ${response.status}: ${clip(data.error_description || data.error || "sin token", 300)}`);
    error.code = "UBER_API_ERROR";
    throw error;
  }
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000;
  return cachedToken;
}

async function uberRequest(path, { method = "GET", body = null, retryAuth = true, okStatuses = [] } = {}) {
  if (!String(path).startsWith("/")) throw new TypeError("La ruta de Uber debe ser relativa");
  const config = requireConfig();
  const token = await getAccessToken();
  const response = await fetch(`${config.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 401 && retryAuth) {
    cachedToken = null;
    tokenExpiresAt = 0;
    await getAccessToken({ forceRefresh: true });
    return uberRequest(path, { method, body, retryAuth: false, okStatuses });
  }

  if (!response.ok && okStatuses.includes(response.status)) {
    return { ignoredStatus: response.status };
  }
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    const error = new Error(`Uber API ${method} ${path} respondió ${response.status}: ${clip(responseBody, 500)}`);
    error.code = "UBER_API_ERROR";
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

export function fetchUberEatsOrder(orderId) {
  return uberRequest(`/v2/eats/order/${encodeURIComponent(orderId)}`);
}

export function acceptUberEatsOrder(orderId, localOrderId) {
  return uberRequest(`/v1/eats/orders/${encodeURIComponent(orderId)}/accept_pos_order`, {
    method: "POST",
    body: {
      reason: "Pedido recibido por Poke Palace POS",
      external_reference_id: String(localOrderId),
      fields_relayed: {
        order_special_instructions: true,
        item_special_instructions: true,
        item_special_requests: true,
        promotions: true,
      },
    },
    okStatuses: [409],
  });
}

export function cancelUberEatsOrder(orderId) {
  return uberRequest(`/v1/eats/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    body: { reason: "OTHER", details: "Cancelado desde Poke Palace POS" },
    okStatuses: [404],
  });
}

async function commissionFor(total) {
  const settings = await StoreSettings.findOne({ key: "main" }).select("deliveryCommissions.uber_eats").lean();
  const rate = Math.max(0, Number(settings?.deliveryCommissions?.uber_eats) || 0);
  return {
    deliveryCommissionRate: rate || null,
    deliveryCommission: rate ? round2(total * rate / 100) : null,
  };
}

async function upsertUberOrder(details, eventType) {
  const normalized = normalizeUberEatsOrder(details, { eventType });
  const commission = await commissionFor(normalized.total);
  const externalFilter = {
    externalProvider: "uber_eats",
    externalOrderId: normalized.externalOrderId,
  };
  const updateFields = { ...normalized, ...commission };
  delete updateFields.status;

  let order = await Order.findOneAndUpdate(externalFilter, { $set: updateFields }, { new: true });
  let created = false;
  if (!order) {
    try {
      order = await Order.create({ ...normalized, ...commission });
      created = true;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      order = await Order.findOne(externalFilter);
      if (!order) order = await Order.findOne({ clientOrderId: normalized.clientOrderId });
    }
  }
  if (!order) throw new Error(`No se pudo guardar el pedido Uber ${normalized.externalOrderId}`);
  return { order, created };
}

async function processOrderEvent(event) {
  if (!event.resourceId) throw new Error(`El evento ${event.eventType} no contiene resource_id`);
  const details = await fetchUberEatsOrder(event.resourceId);
  const { order } = await upsertUberOrder(details, event.eventType);
  const config = getUberEatsConfig();
  const shouldAccept = NEW_ORDER_EVENTS.has(event.eventType)
    && config.autoAccept
    && !order.externalAcceptedAt
    && String(details?.current_state || "CREATED").toUpperCase() === "CREATED";
  if (shouldAccept) {
    const acceptance = await acceptUberEatsOrder(event.resourceId, order._id);
    if (acceptance?.ignoredStatus === 409) {
      const latest = await fetchUberEatsOrder(event.resourceId);
      if (String(latest?.current_state || "").toUpperCase() !== "ACCEPTED") {
        const error = new Error(`Uber no permitió aceptar el pedido ${event.resourceId}`);
        error.code = "UBER_API_ERROR";
        throw error;
      }
    }
    await Order.updateOne(
      { _id: order._id },
      { $set: { externalAcceptedAt: new Date(), externalState: "ACCEPTED" } }
    );
  }
}

async function processCancellationEvent(event) {
  if (!event.resourceId) return;
  const cancelled = await Order.findOneAndUpdate(
    { externalProvider: "uber_eats", externalOrderId: event.resourceId, status: { $ne: "cancelled" } },
    { $set: { status: "cancelled", externalState: "CANCELED", cancelledAt: new Date() } },
    { new: true }
  );
  if (cancelled?.ingredientsDeducted) await restoreInventoryForOrder(cancelled);
}

async function processEvent(event) {
  if (NEW_ORDER_EVENTS.has(event.eventType) || REFRESH_EVENTS.has(event.eventType)) {
    await processOrderEvent(event);
  } else if (CANCEL_EVENTS.has(event.eventType)) {
    await processCancellationEvent(event);
  }
}

export async function recordUberEatsWebhook(rawBody, payload) {
  const eventId = createHash("sha256").update(rawBody).digest("hex");
  const eventType = clip(payload?.event_type || payload?.eventType || "unknown", 100);
  const resourceId = clip(
    payload?.resource_id || payload?.resourceId || payload?.meta?.resource_id || payload?.meta?.resourceId,
    128
  ) || null;
  return ExternalWebhookEvent.findOneAndUpdate(
    { provider: "uber_eats", eventId },
    {
      $setOnInsert: {
        provider: "uber_eats",
        eventId,
        eventType,
        resourceId,
        payload,
        status: "pending",
        nextAttemptAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );
}

function retryDelay(attempts) {
  return Math.min(60_000, 2_000 * (2 ** Math.max(0, attempts - 1)));
}

export async function processPendingUberEatsWebhooks() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    for (let processed = 0; processed < 20; processed += 1) {
      const now = new Date();
      const stale = new Date(Date.now() - 5 * 60_000);
      const event = await ExternalWebhookEvent.findOneAndUpdate(
        {
          provider: "uber_eats",
          $or: [
            { status: "pending", nextAttemptAt: { $lte: now } },
            { status: "processing", updatedAt: { $lt: stale } },
          ],
        },
        { $set: { status: "processing" }, $inc: { attempts: 1 } },
        { new: true, sort: { createdAt: 1 } }
      );
      if (!event) break;

      try {
        await processEvent(event);
        await ExternalWebhookEvent.updateOne(
          { _id: event._id },
          { $set: { status: "processed", processedAt: new Date(), lastError: null } }
        );
      } catch (error) {
        const failed = event.attempts >= MAX_ATTEMPTS;
        await ExternalWebhookEvent.updateOne(
          { _id: event._id },
          {
            $set: {
              status: failed ? "failed" : "pending",
              lastError: clip(error?.message || error, 1000),
              nextAttemptAt: new Date(Date.now() + retryDelay(event.attempts)),
            },
          }
        );
        console.error(`Uber Eats webhook ${event.eventType}:`, error?.message || error);
      }
    }
  } finally {
    queueRunning = false;
  }
}

export function startUberEatsWebhookWorker() {
  if (workerTimer) return;
  processPendingUberEatsWebhooks().catch((error) => console.error("Uber Eats worker:", error.message));
  workerTimer = setInterval(() => {
    processPendingUberEatsWebhooks().catch((error) => console.error("Uber Eats worker:", error.message));
  }, 15_000);
  workerTimer.unref?.();
}

export function resetUberEatsClientForTests() {
  cachedToken = null;
  tokenExpiresAt = 0;
}
