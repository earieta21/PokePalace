import assert from "node:assert/strict";
import test from "node:test";

import {
  getDoubleProteinExtraScoops,
  getUnavailableBowlSelections,
  isBowlMenuItem,
  isMenuItemUnavailable,
  MIN_POS_PROTEINS,
} from "./posRules.js";

test("el POS acepta desde 1 proteína para un bowl mediano", () => {
  assert.equal(MIN_POS_PROTEINS, 1);
});

test("detecta productos POS agotados por id, catálogo o ingrediente", () => {
  const item = {
    id: 4,
    catalogId: "bowl-citrus-tofu",
    availabilityKeys: ["tofu", "shrimp"],
  };

  assert.equal(isMenuItemUnavailable(item, ["4"]), true);
  assert.equal(isMenuItemUnavailable(item, ["bowl-citrus-tofu"]), true);
  assert.equal(isMenuItemUnavailable(item, ["tofu"]), true);
  assert.equal(isMenuItemUnavailable(item, ["salmon"]), false);
});

test("encuentra ingredientes agotados dentro de un bowl personalizado", () => {
  const bowl = {
    base: "white_rice",
    proteins: ["salmon", "tuna"],
    complements: ["avocado"],
    sauces: ["spicy_mayo"],
    toppings: ["nori_strips"],
  };

  assert.deepEqual(
    getUnavailableBowlSelections(bowl, ["salmon", "avocado", "not_selected"]),
    ["avocado", "salmon"],
  );
});

test("revisa las dos bases de un bowl mitad y mitad", () => {
  const bowl = {
    base: "white_rice",
    bases: ["white_rice", "spring_mix"],
    proteins: ["salmon"],
  };

  assert.deepEqual(
    getUnavailableBowlSelections(bowl, ["spring_mix"]),
    ["spring_mix"],
  );
});

test("proteína doble produce exactamente un scoop para bowl personalizado grande", () => {
  const reward = { type: "double_protein" };
  const largeBowl = { bowlSize: "large", proteins: ["tuna", "salmon", "tofu"] };
  const mediumBowl = { bowlSize: "normal", proteins: ["tuna", "salmon"] };

  assert.deepEqual(getDoubleProteinExtraScoops(reward, largeBowl, "salmon"), ["salmon"]);
  assert.deepEqual(getDoubleProteinExtraScoops(reward, largeBowl, "shrimp"), []);
  assert.deepEqual(getDoubleProteinExtraScoops(reward, mediumBowl, "salmon"), []);
});

test("identifica bowls por categoría, sin depender del nombre", () => {
  assert.equal(isBowlMenuItem({ name: "Tofu Cítrico", categoryKey: "bowls" }), true);
  assert.equal(isBowlMenuItem({ name: "Edamame", categoryKey: "starters" }), false);
});
