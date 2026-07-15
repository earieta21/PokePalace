import test from "node:test";
import assert from "node:assert/strict";
import {
  findUnavailableCustomerBowlItems,
  isCustomerManagedOrder,
  isWithinRestaurantHours,
  normalizeCustomerOrderId,
  sanitizeCustomerBowl,
  usefulPointsToRedeem,
} from "../utils/customerOrder.js";
import { stableCustomerOrderObjectId } from "../utils/orderReservations.js";
import { BOWL_BASE_PRICE, computePricing } from "../pricing.js";

test("solo órdenes online entran a cancelación y reversión de cliente", () => {
  assert.equal(isCustomerManagedOrder({ source: "online" }), true);
  assert.equal(isCustomerManagedOrder({ source: "pos" }), false);
  assert.equal(isCustomerManagedOrder(null), false);
});

test("los horarios de pedidos usan America/Tijuana en verano e invierno", () => {
  assert.equal(isWithinRestaurantHours(new Date("2026-07-15T17:59:59Z")), false); // 10:59 PDT
  assert.equal(isWithinRestaurantHours(new Date("2026-07-15T18:00:00Z")), true);  // 11:00 PDT
  assert.equal(isWithinRestaurantHours(new Date("2026-01-15T04:59:59Z")), true);  // 20:59 PST
  assert.equal(isWithinRestaurantHours(new Date("2026-01-15T05:00:00Z")), false); // 21:00 PST
});

test("el canje se limita a bloques completos que caben en el total", () => {
  assert.equal(usefulPointsToRedeem({ availablePoints: 2000, requestedPoints: 2000, orderTotal: 249 }), 900);
  assert.equal(usefulPointsToRedeem({ availablePoints: 500, requestedPoints: 500, orderTotal: 49 }), 100);
  assert.equal(usefulPointsToRedeem({ availablePoints: 500, requestedPoints: 500, orderTotal: 24.99 }), 0);
  assert.equal(usefulPointsToRedeem({ availablePoints: 250, requestedPoints: 1000, orderTotal: 500 }), 200);
});

test("un porcentaje manipulado nunca descuenta más del total", () => {
  const pricing = computePricing("normal", { discountType: "percent", discountValue: 250 });
  assert.equal(pricing.discount, BOWL_BASE_PRICE);
  assert.equal(pricing.total, 0);
});

test("clientOrderId de cliente es estable y acotado", () => {
  assert.equal(normalizeCustomerOrderId("web:12345678"), "web:12345678");
  assert.equal(normalizeCustomerOrderId(""), null);
  assert.throws(() => normalizeCustomerOrderId("corto"), /clientOrderId/);
  assert.throws(() => normalizeCustomerOrderId("web id con espacios"), /clientOrderId/);
});

test("un clientOrderId siempre deriva la misma reserva y otros ids no colisionan", () => {
  const first = stableCustomerOrderObjectId("web:pedido-estable-0001");
  const retry = stableCustomerOrderObjectId("web:pedido-estable-0001");
  const other = stableCustomerOrderObjectId("web:pedido-estable-0002");

  assert.equal(String(first), String(retry));
  assert.notEqual(String(first), String(other));
  assert.match(String(first), /^[a-f0-9]{24}$/);
  assert.throws(() => stableCustomerOrderObjectId(""), /clientOrderId/);
});

test("el catálogo rechaza ids, duplicados y límites manipulados y deriva el tamaño", () => {
  const bowl = sanitizeCustomerBowl({
    base: "white_rice",
    proteins: ["salmon", "tuna", "shrimp"],
    marinades: ["ponzu_marinade"],
  });
  assert.equal(bowl.bowlSize, "large");
  assert.throws(
    () => sanitizeCustomerBowl({ base: "arroz", proteins: ["salmon"] }),
    /base válida/
  );
  assert.throws(
    () => sanitizeCustomerBowl({ base: "white_rice", proteins: ["salmon", "salmon"] }),
    /proteins/
  );
  assert.throws(
    () => sanitizeCustomerBowl({ base: "white_rice", proteins: ["salmon"], sauces: ["hack"] }),
    /sauces/
  );
});

test("la disponibilidad del servidor cubre cada sección con los mismos ids del cliente", () => {
  const bowl = sanitizeCustomerBowl({
    base: "white_rice",
    proteins: ["salmon", "tuna"],
    marinades: ["ponzu_marinade"],
    complements: ["avocado"],
    sauces: ["spicy_mayo"],
    toppings: ["furikake"],
  });

  assert.deepEqual(
    findUnavailableCustomerBowlItems(bowl, [
      "white_rice",
      "salmon",
      "ponzu_marinade",
      "avocado",
      "spicy_mayo",
      "furikake",
      "not_in_catalog",
    ]),
    ["white_rice", "salmon", "ponzu_marinade", "avocado", "spicy_mayo", "furikake"]
  );
  assert.deepEqual(findUnavailableCustomerBowlItems(bowl, ["WHITE_RICE"]), []);
  assert.deepEqual(findUnavailableCustomerBowlItems(bowl, null), []);
});
