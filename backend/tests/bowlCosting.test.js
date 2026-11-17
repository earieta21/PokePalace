import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECIPE_PARTS,
  bowlMenuPrice,
  computeBowlCost,
  computeComboCost,
  computeSharedParts,
  disposablesCost,
  recipeWeightedCost,
  resolveComplementCosts,
  withoutIva,
} from "../utils/bowlCosting.js";

const emptyConfig = (overrides = {}) => ({
  base: { costPerUnit: 0, unitsPerBowl: 1 },
  baseCostPerKg: 0,
  baseGramsPerPortion: 0,
  marinades: { costPerUnit: 0, unitsPerBowl: 1 },
  complements: { costPerUnit: 0, unitsPerBowl: 4 },
  sauces: { costPerUnit: 0, unitsPerBowl: 1 },
  toppings: { costPerUnit: 0, unitsPerBowl: 2 },
  packaging: { costPerUnit: 0, unitsPerBowl: 1 },
  disposables: [],
  disabledComplements: [],
  ...overrides,
});

test("el precio se mide sin IVA y el atún sellado cobra su recargo", () => {
  assert.equal(withoutIva(230), 198.28);
  assert.equal(bowlMenuPrice("tuna"), 230);
  assert.equal(bowlMenuPrice("seared_tuna"), 250);
  assert.equal(bowlMenuPrice("salmon", "large"), 250);
});

test("sin recetas ni ventas, cada parte queda como el monto capturado a mano", () => {
  const result = recipeWeightedCost({
    keys: RECIPE_PARTS.sauces,
    frequency: {},
    recipeCosts: {},
    fallbackPerServing: 4,
    fallbackTotal: 6,
  });
  assert.deepEqual(result, { cost: 6, source: "manual", coveragePct: 0, missing: [] });
});

test("las salsas con receta usan su costo real y las demás el capturado, ponderado por uso", () => {
  const result = recipeWeightedCost({
    keys: ["spicy_mayo", "soy_sauce", "sriracha"],
    // 60% de los bowls lleva spicy mayo, 40% soya, nadie sriracha.
    frequency: { spicy_mayo: 0.6, soy_sauce: 0.4, sriracha: 0 },
    recipeCosts: { spicy_mayo: 5 },
    fallbackPerServing: 2,
    fallbackTotal: 99,
  });
  // 0.6 × $5 + 0.4 × $2
  assert.equal(result.cost, 3.8);
  assert.equal(result.source, "mixto");
  assert.equal(result.coveragePct, 60);
  assert.deepEqual(result.missing, [{ key: "soy_sauce", frequency: 0.4 }]);
});

test("una receta de complemento manda sobre la unidad capturada", () => {
  const costs = resolveComplementCosts(
    [],
    { spicy_surimi: { costPerUnit: 100, portionsPerUnit: 10 } },
    { spicy_surimi: 7.5 }
  );
  assert.equal(costs.spicy_surimi.costPerPortion, 7.5);
  assert.equal(costs.spicy_surimi.source, "receta");
});

test("los desechables se prorratean por pieza y por cuándo se usan", () => {
  const catalog = new Map([
    ["a", { name: "Bowl 32 oz", piecesPerPack: 50 }],
    ["b", { name: "Bolsa", piecesPerPack: 100 }],
    ["c", { name: "Vasito 2 oz", piecesPerPack: 250 }],
  ]);
  const { total, detail } = disposablesCost(
    [
      { disposableId: "a", packPrice: 250, piecesPerBowl: 1, appliesTo: "all" },      // $5.00
      { disposableId: "b", packPrice: 150, piecesPerBowl: 1, appliesTo: "togo" },     // $1.50 × 0.8
      { disposableId: "c", packPrice: 125, piecesPerBowl: 1, appliesTo: "per_sauce" }, // $0.50 × 1.5
    ],
    catalog,
    { togoShare: 0.8, saucesPerBowl: 1.5 }
  );
  assert.equal(total, 5 + 1.2 + 0.75);
  assert.deepEqual(detail.map((line) => line.perBowl), [5, 1.2, 0.75]);
});

test("un desechable borrado del catálogo sigue costando con su copia guardada", () => {
  const { total, detail } = disposablesCost(
    [{ disposableId: "x", name: "Tapa", piecesPerPack: 50, packPrice: 100, piecesPerBowl: 1, appliesTo: "all" }],
    new Map(),
  );
  assert.equal(total, 2);
  assert.equal(detail[0].missingFromCatalog, true);
});

test("el desglose de desechables reemplaza al monto general de empaque", () => {
  const catalog = new Map([["a", { name: "Bowl", piecesPerPack: 50 }]]);
  const legacy = computeSharedParts({ config: emptyConfig({ packaging: { costPerUnit: 9, unitsPerBowl: 1 } }) });
  assert.equal(legacy.rows.packaging, 9);

  const itemized = computeSharedParts({
    config: emptyConfig({
      packaging: { costPerUnit: 9, unitsPerBowl: 1 },
      disposables: [{ disposableId: "a", packPrice: 200, piecesPerBowl: 1, appliesTo: "all" }],
    }),
    disposableCatalog: catalog,
  });
  assert.equal(itemized.rows.packaging, 4);
  assert.equal(itemized.detail.packaging.source, "desglose");
});

test("la merma encarece la proteína y el margen sale contra el precio sin IVA", () => {
  const shared = computeSharedParts({ config: emptyConfig() });
  const proteinCosts = { salmon: { costPerKg: 400, source: "inventario" } };

  const full = computeBowlCost({ proteinCosts, proteinKey: "salmon", shared });
  assert.equal(full.rows.protein, 40); // 100 g a $400/kg

  const trimmed = computeBowlCost({ proteinCosts, proteinKey: "salmon", proteinYields: { salmon: 80 }, shared });
  assert.equal(trimmed.proteinUsableCostPerKg, 500);
  assert.equal(trimmed.rows.protein, 50);
  assert.equal(trimmed.menuPrice, 230);
  assert.equal(trimmed.price, 198.28);
  assert.equal(trimmed.margin, 148.28);
  assert.equal(trimmed.scenarios.promo2x1.price, withoutIva(125));
});

test("el combo se mide contra su precio sin IVA", () => {
  const combo = computeComboCost({ config: { comboDrinkCost: 10, comboRiceCakeCost: 5 }, bowlTotal: 85 });
  assert.equal(combo.total, 100);
  assert.equal(combo.price, withoutIva(289));
});
