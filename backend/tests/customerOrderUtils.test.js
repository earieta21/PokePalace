import test from "node:test";
import assert from "node:assert/strict";
import {
  findUnavailableCustomerBowlItems,
  findUnavailableCustomerCartItems,
  isCustomerManagedOrder,
  isRestaurantClosedDay,
  isWithinRestaurantHours,
  normalizeCustomerOrderId,
  sanitizeCustomerBowl,
  sanitizeCustomerCart,
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
  // 15 de julio 2026 es miércoles en hora de Tijuana — se usa jueves 16
  // para probar solo el límite de hora, sin que el día cerrado interfiera.
  assert.equal(isWithinRestaurantHours(new Date("2026-07-16T17:59:59Z")), false); // 10:59 PDT, jueves
  assert.equal(isWithinRestaurantHours(new Date("2026-07-16T18:00:00Z")), true);  // 11:00 PDT, jueves
  // "2026-01-15T04:59:59Z" cae en 14 de enero local (miércoles) por el
  // cambio de zona horaria — se usa el 16 en UTC (= 15 de enero local,
  // jueves) para aislar el límite de hora del día cerrado.
  assert.equal(isWithinRestaurantHours(new Date("2026-01-16T04:59:59Z")), true);  // 20:59 PST, jueves
  assert.equal(isWithinRestaurantHours(new Date("2026-01-16T05:00:00Z")), false); // 21:00 PST, jueves
});

test("el restaurante permanece cerrado todo el miércoles sin importar la hora", () => {
  // 15 de julio 2026 es miércoles en horario de Tijuana.
  assert.equal(isRestaurantClosedDay(new Date("2026-07-15T18:30:00Z")), true);  // 11:30 PDT, miércoles
  assert.equal(isRestaurantClosedDay(new Date("2026-07-16T18:30:00Z")), false); // 11:30 PDT, jueves
  assert.equal(isWithinRestaurantHours(new Date("2026-07-15T18:30:00Z")), false); // dentro de horario pero cerrado por día
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
    marinades: ["citrus_marinade"],
  });
  assert.equal(bowl.bowlSize, "large");
  assert.deepEqual(bowl.marinades, ["citrus_marinade"]);
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

test("el armador solo acepta el catálogo curado de marinados (cítrico, spicy y dulce)", () => {
  const bowl = sanitizeCustomerBowl({
    base: "white_rice",
    proteins: ["salmon"],
    marinades: ["spicy_marinade", "sweet_marinade"],
  });
  assert.deepEqual(bowl.marinades, ["spicy_marinade", "sweet_marinade"]);

  assert.throws(
    () => sanitizeCustomerBowl({ base: "white_rice", proteins: ["salmon"], marinades: ["ponzu_marinade"] }),
    /marinades/
  );
  assert.throws(
    () => sanitizeCustomerBowl({
      base: "white_rice",
      proteins: ["salmon"],
      marinades: ["citrus_marinade", "spicy_marinade", "sweet_marinade"],
    }),
    /marinades/
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
  assert.equal(computePricing(bowl.bowlSize, null, { proteins: bowl.proteins }).total, BOWL_BASE_PRICE);
});

test("el pedido público acepta atún sellado y cobra su extra de 20 pesos", () => {
  const bowl = sanitizeCustomerBowl({
    base: "white_rice",
    proteins: ["tuna", "seared_tuna"],
  });

  assert.deepEqual(bowl.proteins, ["tuna", "seared_tuna"]);
  assert.equal(
    computePricing(bowl.bowlSize, null, { proteins: bowl.proteins }).total,
    BOWL_BASE_PRICE + 20
  );
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

test("el carrito acepta 2 bowls y un artículo del catálogo en un solo pedido", () => {
  const cart = sanitizeCustomerCart([
    { base: "white_rice", proteins: ["salmon"] },
    { base: "quinoa", proteins: ["tuna", "shrimp"] },
    { kind: "item", catalogId: "coca-zero", qty: 2 },
  ]);

  assert.equal(cart.length, 3);
  assert.equal(cart[0].kind, "bowl");
  assert.equal(cart[0].base, "white_rice");
  assert.equal(cart[1].kind, "bowl");
  assert.equal(cart[1].base, "quinoa");
  assert.equal(cart[2].kind, "item");
  assert.equal(cart[2].catalogId, "coca-zero");
  assert.equal(cart[2].qty, 2);
  assert.equal(cart[2].price, 30); // precio autoritativo del servidor, no el del cliente
});

test("el carrito rechaza los bowls de venta rápida del POS (sin receta para un cliente)", () => {
  assert.throws(
    () => sanitizeCustomerCart([{ kind: "item", catalogId: "bowl-mediano-rapido", qty: 1 }]),
    /Artículo 1/
  );
  assert.throws(
    () => sanitizeCustomerCart([{ kind: "item", catalogId: "bowl-grande-rapido", qty: 1 }]),
    /Artículo 1/
  );
});

test("el carrito rechaza estar vacío o exceder el máximo de líneas", () => {
  assert.throws(() => sanitizeCustomerCart([]), /carrito está vacío/);
  assert.throws(() => sanitizeCustomerCart(null), /carrito está vacío/);
  const tooMany = Array.from({ length: 13 }, () => ({ base: "white_rice", proteins: ["salmon"] }));
  assert.throws(() => sanitizeCustomerCart(tooMany), /máximo/);
});

test("un bowl inválido dentro del carrito señala cuál línea falló", () => {
  assert.throws(
    () => sanitizeCustomerCart([
      { base: "white_rice", proteins: ["salmon"] },
      { base: "arroz", proteins: ["salmon"] },
    ]),
    /Bowl 2:.*base válida/
  );
});

test("la disponibilidad del carrito revisa bowls y artículos por separado", () => {
  const cart = sanitizeCustomerCart([
    { base: "white_rice", proteins: ["salmon"] },
    { kind: "item", catalogId: "coca-zero", qty: 1 },
  ]);

  assert.deepEqual(findUnavailableCustomerCartItems(cart, ["salmon"]), ["salmon"]);
  assert.deepEqual(findUnavailableCustomerCartItems(cart, ["coca_zero"]), ["coca_zero"]);
  assert.deepEqual(findUnavailableCustomerCartItems(cart, ["not_in_cart"]), []);
});
