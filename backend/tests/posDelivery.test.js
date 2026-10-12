import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizePosDelivery, sanitizeDeliveryCommissions, PosOrderValidationError } from "../config/posCatalog.js";

test("delivery por app se registra como pagado en la app", () => {
  assert.deepEqual(
    sanitizePosDelivery({ fulfillment: "delivery", deliveryPlatform: "uber_eats", paymentMethod: "delivery_app" }),
    { fulfillment: "delivery", deliveryPlatform: "uber_eats", paymentMethod: "delivery_app" },
  );
});

test("un pedido de app no puede cobrarse con tarjeta ni efectivo", () => {
  assert.throws(
    () => sanitizePosDelivery({ fulfillment: "delivery", deliveryPlatform: "didi_food", paymentMethod: "card_terminal" }),
    PosOrderValidationError,
  );
});

test("pagado en la app solo aplica a plataformas de delivery", () => {
  assert.throws(() => sanitizePosDelivery({ fulfillment: "pickup", paymentMethod: "delivery_app" }), PosOrderValidationError);
  assert.throws(
    () => sanitizePosDelivery({ fulfillment: "delivery", deliveryPlatform: "propio", paymentMethod: "delivery_app" }),
    PosOrderValidationError,
  );
});

test("repartidor propio acepta efectivo y la plataforma se ignora fuera de delivery", () => {
  assert.equal(
    sanitizePosDelivery({ fulfillment: "delivery", deliveryPlatform: "propio", paymentMethod: "cash" }).deliveryPlatform,
    "propio",
  );
  assert.equal(
    sanitizePosDelivery({ fulfillment: "pickup", deliveryPlatform: "rappi", paymentMethod: "cash" }).deliveryPlatform,
    null,
  );
});

test("valores desconocidos se rechazan y los vacíos usan los defaults", () => {
  assert.throws(() => sanitizePosDelivery({ fulfillment: "delivery", deliveryPlatform: "ifood" }), PosOrderValidationError);
  assert.throws(() => sanitizePosDelivery({ fulfillment: "drone" }), PosOrderValidationError);
  assert.throws(() => sanitizePosDelivery({ paymentMethod: "online" }), PosOrderValidationError);
  assert.deepEqual(sanitizePosDelivery({}), { fulfillment: "pickup", deliveryPlatform: null, paymentMethod: "card_terminal" });
  // Venta delivery encolada offline antes de capturar plataforma.
  assert.equal(sanitizePosDelivery({ fulfillment: "delivery", paymentMethod: "cash" }).deliveryPlatform, null);
});

test("comisiones de delivery: porcentajes válidos por app", () => {
  assert.deepEqual(sanitizeDeliveryCommissions({ uber_eats: "30", didi_food: 25.555 }), { uber_eats: 30, didi_food: 25.56 });
  assert.throws(() => sanitizeDeliveryCommissions({ propio: 10 }), PosOrderValidationError);
  assert.throws(() => sanitizeDeliveryCommissions({ rappi: 75 }), PosOrderValidationError);
  assert.throws(() => sanitizeDeliveryCommissions({ rappi: -1 }), PosOrderValidationError);
  assert.throws(() => sanitizeDeliveryCommissions({ rappi: "" }), PosOrderValidationError);
  assert.throws(() => sanitizeDeliveryCommissions(null), PosOrderValidationError);
});
