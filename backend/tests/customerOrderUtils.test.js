import test from "node:test";
import assert from "node:assert/strict";
import {
  findUnavailableCustomerBowlItems,
  findUnavailableCustomerCartItems,
  findUnavailablePromo2x1Items,
  isCustomerManagedOrder,
  isWithinRestaurantHours,
  normalizeCustomerOrderId,
  restaurantOpenHour,
  sanitizeCustomerBowl,
  sanitizeCustomerCart,
  sanitizeCustomerPromo2x1,
  usefulPointsToRedeem,
} from "../utils/customerOrder.js";
import { stableCustomerOrderObjectId } from "../utils/orderReservations.js";
import { BOWL_BASE_PRICE, computePricing, PROMO_2X1_BOWLS_PRICE } from "../pricing.js";

test("órdenes online y de WhatsApp entran a cancelación y reversión de cliente", () => {
  assert.equal(isCustomerManagedOrder({ source: "online" }), true);
  assert.equal(isCustomerManagedOrder({ source: "whatsapp" }), true);
  assert.equal(isCustomerManagedOrder({ source: "pos" }), false);
  assert.equal(isCustomerManagedOrder(null), false);
});

test("los horarios de pedidos usan America/Tijuana en verano e invierno", () => {
  // 16 de julio 2026 es jueves en hora de Tijuana — horario normal (abre 11:00).
  assert.equal(isWithinRestaurantHours(new Date("2026-07-16T17:59:59Z")), false); // 10:59 PDT, jueves
  assert.equal(isWithinRestaurantHours(new Date("2026-07-16T18:00:00Z")), true);  // 11:00 PDT, jueves
  // "2026-01-16T04:59:59Z" cae en 15 de enero local (jueves) por el cambio de
  // zona horaria — confirma que el límite de las 21:00 también aplica en invierno.
  assert.equal(isWithinRestaurantHours(new Date("2026-01-16T04:59:59Z")), true);  // 20:59 PST, jueves
  assert.equal(isWithinRestaurantHours(new Date("2026-01-16T05:00:00Z")), false); // 21:00 PST, jueves
});

test("viernes, sábado y domingo abren una hora antes (10:00) que el resto de la semana", () => {
  // 17 de julio 2026 es viernes en hora de Tijuana.
  assert.equal(isWithinRestaurantHours(new Date("2026-07-17T16:59:59Z")), false); // 9:59 PDT, viernes
  assert.equal(isWithinRestaurantHours(new Date("2026-07-17T17:00:00Z")), true);  // 10:00 PDT, viernes
  // A la misma hora, un jueves normal todavía no abre.
  assert.equal(isWithinRestaurantHours(new Date("2026-07-16T17:30:00Z")), false); // 10:30 PDT, jueves
  // El cierre sigue siendo 21:00 aunque haya abierto más temprano.
  assert.equal(isWithinRestaurantHours(new Date("2026-07-18T03:59:59Z")), true);  // 20:59 PDT, viernes
  assert.equal(isWithinRestaurantHours(new Date("2026-07-18T04:00:00Z")), false); // 21:00 PDT, viernes
  // 16 de enero 2026 (invierno) es viernes en hora de Tijuana — mismo horario
  // temprano en temporada de horario estándar (PST).
  assert.equal(isWithinRestaurantHours(new Date("2026-01-16T17:59:59Z")), false); // 9:59 PST, viernes
  assert.equal(isWithinRestaurantHours(new Date("2026-01-16T18:00:00Z")), true);  // 10:00 PST, viernes
});

test("el restaurante ya abre todos los días, incluido miércoles", () => {
  // 15 de julio 2026 es miércoles en hora de Tijuana — antes era el día
  // cerrado, ahora abre en el horario normal (11:00) como cualquier otro
  // día entre semana.
  assert.equal(isWithinRestaurantHours(new Date("2026-07-15T17:59:59Z")), false); // 10:59 PDT, miércoles
  assert.equal(isWithinRestaurantHours(new Date("2026-07-15T18:00:00Z")), true);  // 11:00 PDT, miércoles
});

test("restaurantOpenHour regresa 10 de viernes a domingo y 11 el resto de la semana", () => {
  assert.equal(restaurantOpenHour(new Date("2026-07-15T20:00:00Z")), 11); // miércoles
  assert.equal(restaurantOpenHour(new Date("2026-07-16T20:00:00Z")), 11); // jueves
  assert.equal(restaurantOpenHour(new Date("2026-07-17T20:00:00Z")), 10); // viernes
  assert.equal(restaurantOpenHour(new Date("2026-07-18T20:00:00Z")), 10); // sábado
  assert.equal(restaurantOpenHour(new Date("2026-07-19T20:00:00Z")), 10); // domingo
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

test("el carrito acepta Combo Palace y reemplaza el precio enviado por $279", () => {
  const [combo] = sanitizeCustomerCart([{
    kind: "item",
    catalogId: "combo-palace",
    price: 0.01,
    qty: 1,
    comboBowlId: "bowl-quinoa",
    comboDrinkId: "coca-zero",
    comboRiceCakeId: "miel-rice-cake",
  }]);

  assert.equal(combo.kind, "item");
  assert.equal(combo.price, 279);
  assert.equal(combo.comboBowlId, "bowl-quinoa");
  assert.equal(combo.comboDrinkId, "coca-zero");
  assert.equal(combo.comboRiceCakeId, "miel-rice-cake");
  assert.deepEqual(findUnavailableCustomerCartItems([combo], ["coca_zero"]), ["coca_zero"]);
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

test("2x1 en Bowls exige 1 proteína válida y exactamente 2 bowls", () => {
  const validBowl = { base: "white_rice", complements: ["avocado"] };
  assert.throws(
    () => sanitizeCustomerPromo2x1({ protein: "not_a_protein", bowls: [validBowl, validBowl] }),
    /1 proteína válida/
  );
  assert.throws(
    () => sanitizeCustomerPromo2x1({ protein: "salmon", bowls: [validBowl] }),
    /se requieren 2 bowls/
  );
  assert.throws(
    () => sanitizeCustomerPromo2x1({ protein: "salmon", bowls: [validBowl, validBowl, validBowl] }),
    /se requieren 2 bowls/
  );
});

test("2x1 en Bowls limita cada bowl a 4 complementos aunque el catálogo permita más", () => {
  const tooManyComplements = {
    base: "white_rice",
    complements: ["avocado", "edamame", "cucumber", "mango", "beet"],
  };
  assert.throws(
    () => sanitizeCustomerPromo2x1({
      protein: "salmon",
      bowls: [tooManyComplements, { base: "quinoa" }],
    }),
    /Selección inválida en complements/
  );

  const promo = sanitizeCustomerPromo2x1({
    protein: "salmon",
    bowls: [
      { base: "white_rice", complements: ["avocado", "edamame", "cucumber", "mango"] },
      { base: "quinoa", complements: [] },
    ],
  });
  assert.equal(promo.protein, "salmon");
  assert.equal(promo.bowls.length, 2);
  assert.equal(promo.bowls[0].complements.length, 4);
});

test("el carrito acepta 2x1 en Bowls, ignora el precio enviado por el cliente y revisa disponibilidad de ambos bowls", () => {
  const [promoLine] = sanitizeCustomerCart([{
    kind: "promo2x1",
    protein: "salmon",
    price: 1, // el cliente podría mandar cualquier cosa — el servidor manda
    bowls: [
      { base: "white_rice", complements: ["avocado"] },
      { base: "quinoa", complements: ["edamame", "cucumber"] },
    ],
  }]);

  assert.equal(promoLine.kind, "promo2x1");
  assert.equal(promoLine.catalogId, "promo-2x1-bowls");
  assert.equal(promoLine.price, PROMO_2X1_BOWLS_PRICE);
  assert.equal(promoLine.qty, 1);

  assert.deepEqual(findUnavailablePromo2x1Items(promoLine, ["salmon"]), ["salmon"]);
  assert.deepEqual(findUnavailablePromo2x1Items(promoLine, ["edamame"]), ["edamame"]);
  assert.deepEqual(findUnavailablePromo2x1Items(promoLine, ["not_in_promo"]), []);
  assert.deepEqual(findUnavailableCustomerCartItems([promoLine], ["quinoa"]), ["quinoa"]);
});
