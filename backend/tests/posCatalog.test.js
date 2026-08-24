import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getPosCatalogItem,
  getPosInventoryDemand,
  POS_CATALOG,
  PosOrderValidationError,
  resolvePosItems,
  sanitizePosBowl,
  sanitizePosRewardTopping,
} from "../config/posCatalog.js";

const EXPECTED_PRESET_RECIPES = {
  "bowl-emerald-salmon": {
    white_rice: 1,
    salmon: 0.05,
    tuna: 0.05,
    avocado: 1,
    cucumber: 1,
    edamame: 1,
    spicy_mayo: 1,
    citrus_dressing: 1,
    sesame_seeds: 1,
    nori_strips: 1,
  },
  "bowl-spicy-tuna": {
    quinoa: 1,
    tuna: 0.05,
    salmon: 0.05,
    cucumber: 1,
    edamame: 1,
    spicy_surimi: 1,
    sriracha: 1,
    spicy_mayo: 1,
    masago: 1,
    nori_strips: 1,
  },
  "bowl-tropical-shrimp": {
    spring_mix: 1,
    shrimp: 0.05,
    tofu: 0.05,
    pineapple: 1,
    avocado: 1,
    cucumber: 1,
    sweet_dressing: 1,
    cilantro_dressing: 1,
    sesame_seeds: 1,
    masago: 1,
  },
  "bowl-citrus-tofu": {
    spring_mix: 1,
    tofu: 0.05,
    shrimp: 0.05,
    cucumber: 1,
    beet: 1,
    avocado: 1,
    citrus_dressing: 1,
    cilantro_dressing: 1,
    sesame_seeds: 1,
    nori_strips: 1,
  },
};

const makeBowl = (overrides = {}) => ({
  base: "white_rice",
  proteins: ["tuna", "salmon"],
  ...overrides,
});

test("las cuatro recetas POS coinciden con los presets vigentes", () => {
  // Filtra por los 4 catalogIds de los bowls de la casa con receta — no por
  // categoría "bowls" a secas, porque esa categoría también incluye los
  // bowls de venta rápida (sin receta) para cuando no da tiempo de capturar
  // el bowl personalizado completo.
  const presetIds = new Set(Object.keys(EXPECTED_PRESET_RECIPES));
  const houseBowls = POS_CATALOG.filter((item) => presetIds.has(item.catalogId));

  assert.equal(houseBowls.length, 4);
  assert.deepEqual(
    Object.fromEntries(houseBowls.map((item) => [item.catalogId, item.inventoryRecipe])),
    EXPECTED_PRESET_RECIPES
  );

  for (const bowl of houseBowls) {
    const [item] = resolvePosItems([{ catalogId: bowl.catalogId, qty: 1 }]);
    assert.deepEqual(
      getPosInventoryDemand({ items: [item] }),
      Object.fromEntries(Object.entries(bowl.inventoryRecipe).sort(([a], [b]) => a.localeCompare(b)))
    );
  }
});

test("el bowl mediano/grande de venta rápida cobra el precio correcto y no descuenta inventario", () => {
  const [mediano, grande] = resolvePosItems([
    { catalogId: "bowl-mediano-rapido", qty: 1 },
    { catalogId: "bowl-grande-rapido", qty: 1 },
  ]);

  assert.equal(mediano.name, "Bowl mediano");
  assert.equal(mediano.price, 230);
  assert.equal(grande.name, "Bowl grande");
  assert.equal(grande.price, 250);

  assert.deepEqual(getPosInventoryDemand({ items: [mediano, grande] }), {});
});

test("el inventario reparte 100 g en el bowl mediano y 120 g en el grande", () => {
  assert.deepEqual(
    getPosInventoryDemand({ proteins: ["tuna"] }),
    { tuna: 0.1 }
  );
  assert.deepEqual(
    getPosInventoryDemand({ proteins: ["tuna", "salmon"] }),
    { salmon: 0.05, tuna: 0.05 }
  );
  assert.deepEqual(
    getPosInventoryDemand({ proteins: ["tuna", "salmon", "tofu"], bowlSize: "large" }),
    { salmon: 0.04, tofu: 0.04, tuna: 0.04 }
  );
});

test("cada scoop extra descuenta 40 g de la proteína elegida", () => {
  assert.deepEqual(
    getPosInventoryDemand({
      proteins: ["tuna", "salmon"],
      extraScoopProteins: ["tuna", "tuna"],
    }),
    { salmon: 0.05, tuna: 0.13 }
  );
});

test("el producto 4 ahora es Tofu Cítrico y conserva su identificador legado", () => {
  const tofu = getPosCatalogItem(4);

  assert.equal(tofu.catalogId, "bowl-citrus-tofu");
  assert.equal(tofu.legacyId, 4);
  assert.equal(tofu.name, "Tofu Cítrico");
  assert.equal(getPosCatalogItem("bowl-citrus-octopus"), null);

  const [resolved] = resolvePosItems([{ id: 4, name: "Pulpo cítrico", price: 1 }]);
  assert.equal(resolved.catalogId, "bowl-citrus-tofu");
  assert.equal(resolved.name, "Tofu Cítrico");
  assert.equal(resolved.price, 230);
});

test("el armador POS acepta solamente los ingredientes del menú vigente", () => {
  for (const base of ["white_rice", "spring_mix", "quinoa"]) {
    assert.equal(sanitizePosBowl(makeBowl({ base })).base, base);
  }

  for (const protein of ["tuna", "salmon", "shrimp", "tofu"]) {
    const partner = protein === "tuna" ? "salmon" : "tuna";
    assert.ok(sanitizePosBowl(makeBowl({ proteins: [protein, partner] })).proteins.includes(protein));
  }

  for (const complement of [
    "shredded_carrots", "seaweed", "edamame", "red_onion", "cucumber",
    "pineapple", "beet", "surimi", "spicy_surimi", "avocado",
  ]) {
    assert.deepEqual(sanitizePosBowl(makeBowl({ complements: [complement] })).complements, [complement]);
  }

  for (const sauce of [
    "spicy_mayo", "sweet_dressing", "citrus_dressing",
    "red_sauce", "sriracha", "cilantro_dressing",
  ]) {
    assert.deepEqual(sanitizePosBowl(makeBowl({ sauces: [sauce] })).sauces, [sauce]);
  }

  for (const topping of [
    "black_olives", "toasted_peanuts", "sesame_seeds", "nori_strips", "masago", "croutons",
  ]) {
    assert.deepEqual(sanitizePosBowl(makeBowl({ toppings: [topping] })).toppings, [topping]);
    assert.equal(sanitizePosRewardTopping(topping), topping);
  }
});

test("el armador POS rechaza opciones retiradas del catálogo y marinados", () => {
  const retiredSelections = [
    { base: "brown_rice" },
    { proteins: ["tuna", "octopus"] },
    { proteins: ["tuna", "seared_tuna"] },
    { complements: ["mango"] },
    { complements: ["corn"] },
    { sauces: ["soy_sauce"] },
    { sauces: ["avocado_lime"] },
    { toppings: ["furikake"] },
    { toppings: ["crispy_onions"] },
    { marinades: ["citrus_marinade"] },
  ];

  for (const selection of retiredSelections) {
    assert.throws(() => sanitizePosBowl(makeBowl(selection)), PosOrderValidationError);
  }
});
