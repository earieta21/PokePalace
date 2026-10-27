import { createHmac } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getUberEatsConfig,
  getUberEatsWebhookSecret,
  normalizeUberEatsOrder,
  verifyUberWebhookSignature,
} from "../services/uberEats.js";

test("verifica la firma HMAC de Uber usando los bytes crudos", () => {
  const raw = Buffer.from('{"event_type":"orders.notification","resource_id":"abc"}');
  const secret = "secreto-de-prueba";
  const signature = createHmac("sha256", secret).update(raw).digest("hex");

  assert.equal(verifyUberWebhookSignature(raw, signature, secret), true);
  assert.equal(verifyUberWebhookSignature(raw, `sha256=${signature}`, secret), true);
  assert.equal(verifyUberWebhookSignature(Buffer.from(`${raw} `), signature, secret), false);
  assert.equal(verifyUberWebhookSignature(raw, "firma-invalida", secret), false);
});

test("usa los dominios correctos para sandbox y producción", () => {
  const sandbox = getUberEatsConfig({ UBER_EATS_ENV: "sandbox" });
  assert.equal(sandbox.tokenUrl, "https://sandbox-login.uber.com/oauth/v2/token");
  assert.equal(sandbox.apiBase, "https://test-api.uber.com");

  const production = getUberEatsConfig({ UBER_EATS_ENV: "production" });
  assert.equal(production.tokenUrl, "https://auth.uber.com/oauth/v2/token");
  assert.equal(production.apiBase, "https://api.uber.com");
});

test("la firma usa una clave de webhook separada y conserva compatibilidad", () => {
  assert.equal(getUberEatsWebhookSecret({
    UBER_EATS_WEBHOOK_SECRET: "firma-separada",
    UBER_EATS_CLIENT_SECRET: "oauth-secret",
  }), "firma-separada");
  assert.equal(getUberEatsWebhookSecret({ UBER_EATS_CLIENT_SECRET: "oauth-secret" }), "oauth-secret");
});

test("convierte un pedido Uber en una comanda del KDS con modificadores y notas", () => {
  const normalized = normalizeUberEatsOrder({
    id: "f9f363d1-e1c2-4595-b477-c649845bc953",
    display_id: "BC953",
    current_state: "CREATED",
    type: "DELIVERY_BY_UBER",
    store: { id: "store-1" },
    eater: { first_name: "Larry", last_name: "M", phone: "+52 555" },
    cart: {
      special_instructions: "Sin servilletas extra",
      items: [{
        id: "bowl-1",
        instance_id: "instance-1",
        title: "Bowl Palace",
        quantity: 2,
        price: { unit_price: { amount: 18900, currency_code: "MXN" } },
        selected_modifier_groups: [{
          title: "Proteína",
          selected_items: [{ title: "Salmón", quantity: 1 }],
        }],
        special_instructions: "Alergia al ajonjolí",
      }],
    },
    packaging: { disposable_items: { should_include: false } },
    payment: {
      charges: {
        sub_total: { amount: 37800, currency_code: "MXN" },
        tax: { amount: 0, currency_code: "MXN" },
        total: { amount: 37800, currency_code: "MXN" },
      },
    },
  });

  assert.equal(normalized.clientOrderId, "uber_eats:f9f363d1-e1c2-4595-b477-c649845bc953");
  assert.equal(normalized.externalDisplayId, "BC953");
  assert.equal(normalized.customer, "Larry M · UE BC953");
  assert.equal(normalized.fulfillment, "delivery");
  assert.equal(normalized.source, "delivery");
  assert.equal(normalized.deliveryPlatform, "uber_eats");
  assert.equal(normalized.total, 378);
  assert.equal(normalized.items[0].price, 189);
  assert.equal(normalized.items[0].qty, 2);
  assert.match(normalized.items[0].detail, /Proteína: Salmón/);
  assert.match(normalized.items[0].detail, /Alergia al ajonjolí/);
  assert.match(normalized.notes, /Sin servilletas extra/);
  assert.match(normalized.notes, /No incluir cubiertos/);
});

test("marca como programado el webhook scheduled y conserva la hora estimada", () => {
  const normalized = normalizeUberEatsOrder({
    id: "scheduled-1",
    type: "PICK_UP",
    estimated_ready_for_pickup_at: "2026-10-28T15:30:00-07:00",
    cart: { items: [{ id: "agua", title: "Agua", quantity: 1, price: { unit_price: { amount: 3000 } } }] },
    payment: { charges: { total: { amount: 3000 } } },
  }, { eventType: "orders.scheduled.notification" });

  assert.equal(normalized.fulfillment, "pickup");
  assert.equal(normalized.isScheduled, true);
  assert.equal(normalized.scheduledPickupTime.toISOString(), "2026-10-28T22:30:00.000Z");
});
