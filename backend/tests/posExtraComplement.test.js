import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPosInventoryDemand,
  getUnavailablePosSelections,
  PosOrderValidationError,
  resolvePosItems,
} from "../config/posCatalog.js";
import { EXTRA_COMPLEMENT_PRICE } from "../pricing.js";
import { CUSTOMER_EXCLUDED_CATALOG_IDS } from "../utils/customerOrder.js";

test("el extra de complemento cobra el precio del servidor y guarda el complemento", () => {
  const [line] = resolvePosItems([{ id: "extra-complement", qty: 2, complement: "mango", price: 1 }]);
  assert.equal(line.catalogId, "extra-complement");
  assert.equal(line.price, EXTRA_COMPLEMENT_PRICE);
  assert.equal(line.qty, 2);
  assert.equal(line.complement, "mango");
});

test("también se resuelve por su id del POS (legacyId 28)", () => {
  const [line] = resolvePosItems([{ id: 28, complement: "avocado" }]);
  assert.equal(line.catalogId, "extra-complement");
  assert.equal(line.complement, "avocado");
});

test("el extra de complemento exige un complemento válido", () => {
  assert.throws(() => resolvePosItems([{ id: "extra-complement" }]), PosOrderValidationError);
  assert.throws(() => resolvePosItems([{ id: "extra-complement", complement: "salmon" }]), PosOrderValidationError);
});

test("distintos complementos quedan en líneas separadas y los iguales se suman", () => {
  const lines = resolvePosItems([
    { id: "extra-complement", complement: "mango" },
    { id: "extra-complement", complement: "avocado" },
    { id: "extra-complement", complement: "mango" },
  ]);
  assert.deepEqual(lines.map((l) => [l.complement, l.qty]), [["mango", 2], ["avocado", 1]]);
});

test("otros productos ignoran el campo complemento", () => {
  const [line] = resolvePosItems([{ id: "choco-rice-cake", complement: "mango" }]);
  assert.equal(line.complement, undefined);
});

test("cada extra descuenta una porción del complemento elegido", () => {
  const demand = getPosInventoryDemand({ items: [{ catalogId: "extra-complement", qty: 3, complement: "edamame" }] });
  assert.deepEqual(demand, { edamame: 3 });
});

test("un complemento agotado bloquea el extra", () => {
  assert.deepEqual(
    getUnavailablePosSelections({ items: [{ id: "extra-complement", complement: "mango" }], unavailableItems: ["mango"] }),
    ["mango"],
  );
});

test("el extra de complemento no se ofrece a clientes en línea", () => {
  assert.equal(CUSTOMER_EXCLUDED_CATALOG_IDS.has("extra-complement"), true);
});

test("Celsius y Bloom se cobran a $55 y descuentan una pieza cada una", () => {
  const lines = resolvePosItems([{ id: 29, qty: 2 }, { id: "bloom" }]);
  assert.deepEqual(lines.map((l) => [l.name, l.price, l.qty]), [["Celsius", 55, 2], ["Bloom", 55, 1]]);
  assert.deepEqual(getPosInventoryDemand({ items: lines }), { bloom: 1, celsius: 2 });
});

test("el extra de aderezo cobra $10, exige un aderezo válido y descuenta una porción", () => {
  const lines = resolvePosItems([
    { id: 31, sauce: "spicy_mayo", qty: 2 },
    { id: "extra-sauce", sauce: "sriracha" },
  ]);
  assert.deepEqual(lines.map((l) => [l.name, l.price, l.qty, l.sauce]), [
    ["Extra de aderezo", 10, 2, "spicy_mayo"],
    ["Extra de aderezo", 10, 1, "sriracha"],
  ]);
  assert.deepEqual(getPosInventoryDemand({ items: lines }), { spicy_mayo: 2, sriracha: 1 });
  assert.throws(() => resolvePosItems([{ id: "extra-sauce" }]), PosOrderValidationError);
  assert.throws(() => resolvePosItems([{ id: "extra-sauce", sauce: "mango" }]), PosOrderValidationError);
  assert.deepEqual(
    getUnavailablePosSelections({ items: [{ id: "extra-sauce", sauce: "sriracha" }], unavailableItems: ["sriracha"] }),
    ["sriracha"],
  );
  assert.equal(CUSTOMER_EXCLUDED_CATALOG_IDS.has("extra-sauce"), true);
});
