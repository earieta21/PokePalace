import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computePricing, computeExtrasSubtotal, BOWL_BASE_PRICE, LARGE_BOWL_UPCHARGE,
  EXTRA_SCOOP_PRICE, COMPLEMENT_FREE_LIMIT, EXTRA_COMPLEMENT_PRICE,
  PREMIUM_PROTEIN_PRICES,
} from "../pricing.js";
import { distanceMeters, isWithinRestaurant, RESTAURANT_LOCATION } from "../utils/geo.js";
import { isValidPin, hashPin, comparePin } from "../utils/staffPin.js";
import { sanitizeCustomerBowl } from "../utils/customerOrder.js";

/* ── Precios: la fuente de verdad de lo que se le cobra al cliente ── */

test("bowl normal sin promo cuesta el precio base", () => {
  const { subtotal, discount, total } = computePricing("normal", null);
  assert.equal(subtotal, BOWL_BASE_PRICE);
  assert.equal(discount, 0);
  assert.equal(total, BOWL_BASE_PRICE);
});

test("bowl grande suma el cargo extra", () => {
  const { total } = computePricing("large", null);
  assert.equal(total, BOWL_BASE_PRICE + LARGE_BOWL_UPCHARGE);
});

test("promo de porcentaje descuenta sobre el subtotal", () => {
  const { discount, total } = computePricing("normal", { discountType: "percent", discountValue: 10 });
  const round2 = (n) => Math.round(n * 100) / 100;
  assert.equal(discount, round2(BOWL_BASE_PRICE * 0.10));
  assert.equal(total, round2(BOWL_BASE_PRICE - discount));
});

test("promo fija nunca descuenta mas que el subtotal", () => {
  const { discount, total } = computePricing("normal", { discountType: "fixed", discountValue: 99999 });
  assert.equal(discount, BOWL_BASE_PRICE);
  assert.equal(total, 0);
});

test("promo porcentual defensiva nunca supera el 100 por ciento", () => {
  const { discount, total } = computePricing("normal", {
    discountType: "percent",
    discountValue: 250,
  });
  assert.equal(discount, BOWL_BASE_PRICE);
  assert.equal(total, 0);
});

test("sin extras, el subtotal de extras es cero", () => {
  assert.equal(computeExtrasSubtotal(), 0);
  assert.equal(computeExtrasSubtotal({ extraScoops: 0, complementsCount: COMPLEMENT_FREE_LIMIT }), 0);
});

test("cada scoop extra cuesta EXTRA_SCOOP_PRICE", () => {
  assert.equal(computeExtrasSubtotal({ extraScoops: 2 }), 2 * EXTRA_SCOOP_PRICE);
});

test("el atún sellado suma 15 pesos como proteína premium", () => {
  assert.equal(PREMIUM_PROTEIN_PRICES.seared_tuna, 15);
  assert.equal(computeExtrasSubtotal({ proteins: ["tuna", "seared_tuna"] }), 15);
  assert.equal(
    computePricing("normal", null, { proteins: ["seared_tuna"] }).total,
    BOWL_BASE_PRICE + 15
  );
});

test("los primeros COMPLEMENT_FREE_LIMIT complementos son gratis, el resto cuesta EXTRA_COMPLEMENT_PRICE", () => {
  assert.equal(computeExtrasSubtotal({ complementsCount: COMPLEMENT_FREE_LIMIT + 2 }), 2 * EXTRA_COMPLEMENT_PRICE);
  // Nunca negativo si hay menos complementos que el límite gratis.
  assert.equal(computeExtrasSubtotal({ complementsCount: 1 }), 0);
});

test("el bowl grande con scoops y complementos extra suma todo", () => {
  const { total } = computePricing("large", null, { extraScoops: 1, complementsCount: COMPLEMENT_FREE_LIMIT + 1 });
  assert.equal(total, BOWL_BASE_PRICE + LARGE_BOWL_UPCHARGE + EXTRA_SCOOP_PRICE + EXTRA_COMPLEMENT_PRICE);
});

test("el scoop extra solo se acepta de una proteina ya elegida", () => {
  const bowl = sanitizeCustomerBowl({
    base: "white_rice", proteins: ["salmon", "tuna"], extraScoopProteins: ["salmon", "salmon"],
  });
  assert.deepEqual(bowl.extraScoopProteins, ["salmon", "salmon"]); // duplicados permitidos
  assert.throws(() => sanitizeCustomerBowl({
    base: "white_rice", proteins: ["salmon", "tuna"], extraScoopProteins: ["shrimp"],
  }), TypeError);
});

/* ── Geocerca: el candado GPS de las checadas ── */

test("dentro del restaurante pasa la geocerca", () => {
  assert.equal(isWithinRestaurant(RESTAURANT_LOCATION.lat, RESTAURANT_LOCATION.lng), true);
});

test("el centro de Tijuana (a varios km) NO pasa la geocerca", () => {
  assert.equal(isWithinRestaurant(32.5327, -117.0182), false);
});

test("coordenadas invalidas no pasan la geocerca", () => {
  assert.equal(isWithinRestaurant(null, undefined), false);
  assert.equal(isWithinRestaurant(NaN, NaN), false);
  assert.equal(isWithinRestaurant("32.45", "-116.91"), false);
});

test("la distancia Haversine es simetrica y positiva", () => {
  const d1 = distanceMeters(32.4558, -116.9193, 32.5327, -117.0182);
  const d2 = distanceMeters(32.5327, -117.0182, 32.4558, -116.9193);
  assert.ok(Math.abs(d1 - d2) < 0.001);
  assert.ok(d1 > 5000 && d1 < 20000);
});

/* ── PINs del staff ── */

test("solo 4 digitos exactos son un PIN valido", () => {
  assert.equal(isValidPin("1234"), true);
  assert.equal(isValidPin("123"), false);
  assert.equal(isValidPin("12345"), false);
  assert.equal(isValidPin("12a4"), false);
  assert.equal(isValidPin(""), false);
});

test("un PIN hasheado se verifica y uno incorrecto se rechaza", async () => {
  process.env.PIN_PEPPER = process.env.PIN_PEPPER || "pepper-de-prueba";
  const hash = await hashPin("4821");
  assert.notEqual(hash, "4821");
  assert.equal(await comparePin("4821", hash), true);
  assert.equal(await comparePin("0000", hash), false);
});
