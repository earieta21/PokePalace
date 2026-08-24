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

test("órdenes online y de WhatsApp entran a cancelación y reversión de cliente", () => {
  assert.equal(isCustomerManagedOrder({ source: "online" }), true);
  assert.equal(isCustomerManagedOrder({ source: "whatsapp" }), true);
  assert.equal(isCustomerManagedOrder({ source: "pos" }), false);
  assert.equal(isCustomerManagedOrder(null), false);
});

test("los horarios de pedidos usan America/Tijuana en verano e invierno", () => {
  assert.equal(isWithinRestaurantHours(new Date("2026-07-16T17:59:59Z")), false); // jueves, 10:59 PDT
  assert.equal(isWithinRestaurantHours(new Date("2026-07-16T18:00:00Z")), true);  // jueves, 11:00 PDT
  assert.equal(isWithinRestaurantHours(new Date("2026-01-15T04:59:59Z")), true);  // 20:59 PST
  assert.equal(isWithinRestaurantHours(new Date("2026-01-15T05:00:00Z")), false); // 21:00 PST
  assert.equal(isWithinRestaurantHours(new Date("2026-07-15T19:00:00Z")), false); // miércoles, 12:00 PDT
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

test("el catálogo rechaza ids, duplicados y límites manipulados, ignora marinados y deriva el tamaño", () => {
  const bowl = sanitizeCustomerBowl({
    base: "white_rice",
    proteins: ["salmon", "tuna", "shrimp"],
    // Los marinados ya no son parte del armador — se ignoran aunque el
    // cliente los siga enviando desde un favorito o pedido repetido viejo.
    marinades: ["ponzu_marinade"],
  });
  assert.equal(bowl.bowlSize, "large");
  assert.deepEqual(bowl.marinades, []);
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

test("el catálogo acepta el inventario vigente del armador", () => {
  const bowl = sanitizeCustomerBowl({
    base: "spring_mix",
    proteins: ["tofu", "shrimp"],
    complements: ["red_onion", "beet", "surimi", "spicy_surimi"],
    sauces: ["citrus_dressing", "cilantro_dressing"],
    toppings: ["black_olives", "toasted_peanuts", "masago", "croutons"],
  });

  assert.deepEqual(bowl.proteins, ["tofu", "shrimp"]);
  assert.deepEqual(bowl.sauces, ["citrus_dressing", "cilantro_dressing"]);
  assert.deepEqual(bowl.toppings, ["black_olives", "toasted_peanuts", "masago", "croutons"]);
});

test("un bowl de 1 sola proteína es válido y cuesta lo mismo que uno de 2", () => {
  const bowl = sanitizeCustomerBowl({ base: "white_rice", proteins: ["salmon"] });
  assert.equal(bowl.bowlSize, "normal");
  assert.deepEqual(bowl.proteins, ["salmon"]);
  assert.equal(computePricing(bowl.bowlSize, null).total, BOWL_BASE_PRICE);
});

test("mitad y mitad acepta 2 bases distintas y guarda la primera en `base` por compatibilidad", () => {
  const bowl = sanitizeCustomerBowl({
    bases: ["white_rice", "quinoa"],
    proteins: ["salmon"],
  });
  assert.deepEqual(bowl.bases, ["white_rice", "quinoa"]);
  assert.equal(bowl.base, "white_rice");
});

test("mitad y mitad rechaza más de 2 bases, bases repetidas o ids inválidos", () => {
  assert.throws(
    () => sanitizeCustomerBowl({ bases: ["white_rice", "quinoa", "spring_mix"], proteins: ["salmon"] }),
    /base válida/
  );
  assert.throws(
    () => sanitizeCustomerBowl({ bases: ["white_rice", "white_rice"], proteins: ["salmon"] }),
    /base válida/
  );
  assert.throws(
    () => sanitizeCustomerBowl({ bases: ["white_rice", "arroz"], proteins: ["salmon"] }),
    /base válida/
  );
  assert.throws(
    () => sanitizeCustomerBowl({ bases: [], proteins: ["salmon"] }),
    /base válida/
  );
});

test("la disponibilidad del servidor revisa las 2 bases de un bowl mitad y mitad", () => {
  const bowl = sanitizeCustomerBowl({
    bases: ["white_rice", "quinoa"],
    proteins: ["salmon"],
  });

  assert.deepEqual(findUnavailableCustomerBowlItems(bowl, ["quinoa"]), ["quinoa"]);
  assert.deepEqual(findUnavailableCustomerBowlItems(bowl, ["white_rice", "quinoa"]).sort(), ["quinoa", "white_rice"]);
  assert.deepEqual(findUnavailableCustomerBowlItems(bowl, ["spring_mix"]), []);
});

test("la disponibilidad del servidor cubre cada sección con los mismos ids del cliente", () => {
  const bowl = sanitizeCustomerBowl({
    base: "white_rice",
    proteins: ["salmon", "tuna"],
    complements: ["avocado"],
    sauces: ["spicy_mayo"],
    toppings: ["furikake"],
  });

  assert.deepEqual(
    findUnavailableCustomerBowlItems(bowl, [
      "white_rice",
      "salmon",
      "avocado",
      "spicy_mayo",
      "furikake",
      "not_in_catalog",
    ]),
    ["white_rice", "salmon", "avocado", "spicy_mayo", "furikake"]
  );
  assert.deepEqual(findUnavailableCustomerBowlItems(bowl, ["WHITE_RICE"]), []);
  assert.deepEqual(findUnavailableCustomerBowlItems(bowl, null), []);
});
