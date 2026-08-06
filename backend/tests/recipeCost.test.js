import { test } from "node:test";
import assert from "node:assert/strict";

import { computeWeightedAverageCost } from "../utils/inventoryCost.js";
import { computeIngredientLineCost, computeRecipeCost, recipeCompletenessStatus } from "../utils/recipeCost.js";

test("costo promedio ponderado combina lo que ya habia con la compra nueva", () => {
  // 10 kg a $20 + 10 kg a $30 -> promedio $25
  const cost = computeWeightedAverageCost({ qtyBefore: 10, costBefore: 20, qtyReceived: 10, costReceived: 30 });
  assert.equal(cost, 25);
});

test("costo promedio ponderado pesa mas la cantidad mas grande", () => {
  // 90 kg a $10 + 10 kg a $100 -> (900+1000)/100 = 19
  const cost = computeWeightedAverageCost({ qtyBefore: 90, costBefore: 10, qtyReceived: 10, costReceived: 100 });
  assert.equal(cost, 19);
});

test("costo promedio ponderado con existencia en cero usa directo el costo recibido", () => {
  const cost = computeWeightedAverageCost({ qtyBefore: 0, costBefore: 0, qtyReceived: 5, costReceived: 40 });
  assert.equal(cost, 40);
});

test("linea de ingrediente incompleta si falta portionQty/yieldPct/cost", () => {
  assert.equal(computeIngredientLineCost(null, 1).complete, false);
  assert.equal(computeIngredientLineCost({ portionQty: 0.06, yieldPct: null, cost: 200 }, 1).complete, false);
  assert.equal(computeIngredientLineCost({ portionQty: null, yieldPct: 100, cost: 200 }, 1).complete, false);
  assert.equal(computeIngredientLineCost({ portionQty: 0.06, yieldPct: 100, cost: null }, 1).complete, false);
});

test("linea de ingrediente completa calcula costo considerando el rendimiento", () => {
  // 0.06 kg por porcion, 85% de rendimiento, $220/kg, 1 porcion
  // costo = (0.06 / 0.85) * 220 = 15.53
  const { cost, complete } = computeIngredientLineCost({ portionQty: 0.06, yieldPct: 85, cost: 220 }, 1);
  assert.equal(complete, true);
  assert.equal(cost, 15.53);
});

test("computeRecipeCost: receta sin ingredientes es incompleta", () => {
  const result = computeRecipeCost({ ingredients: [], packaging: [] }, { inventoryByKey: new Map(), inventoryById: new Map(), salePrice: 230 });
  assert.equal(result.hasIngredients, false);
  assert.equal(result.complete, false);
});

test("computeRecipeCost: suma ingredientes + empaque + comision y calcula margen", () => {
  const inventoryByKey = new Map([
    ["salmon", { portionQty: 0.06, yieldPct: 100, cost: 200 }], // 12 por porcion
    ["white_rice", { portionQty: 0.15, yieldPct: 100, cost: 20 }], // 3 por porcion
  ]);
  const packagingItem = { _id: "pkg1", cost: 5 };
  const inventoryById = new Map([["pkg1", packagingItem]]);

  const recipe = {
    ingredients: [{ key: "salmon", portions: 1 }, { key: "white_rice", portions: 1 }],
    packaging: [{ inventoryItemId: "pkg1", qty: 1 }],
    commissionPct: 10,
  };

  const result = computeRecipeCost(recipe, { inventoryByKey, inventoryById, salePrice: 230 });
  assert.equal(result.ingredientsCost, 15); // 12 + 3
  assert.equal(result.packagingCost, 5);
  assert.equal(result.commission, 23); // 10% de 230
  assert.equal(result.fullCost, 43); // 15 + 5 + 23
  assert.equal(result.profit, 187); // 230 - 43
  assert.ok(Math.abs(result.marginPct - 81.3) < 0.1);
  assert.equal(result.complete, true);
});

test("computeRecipeCost: un ingrediente sin costear marca la receta incompleta sin tronar", () => {
  const inventoryByKey = new Map([["salmon", { portionQty: 0.06, yieldPct: 100, cost: 200 }]]);
  const recipe = { ingredients: [{ key: "salmon", portions: 1 }, { key: "avocado", portions: 1 }], packaging: [] };
  const result = computeRecipeCost(recipe, { inventoryByKey, inventoryById: new Map(), salePrice: 230 });
  assert.equal(result.complete, false);
  assert.ok(result.missing.includes("avocado"));
  assert.equal(result.ingredientsCost, 12); // solo el salmon cuenta, avocado no aporta 0 sin tronar
});

test("recipeCompletenessStatus: rojo sin receta, amarillo incompleta, verde completa", () => {
  assert.equal(recipeCompletenessStatus(null, { hasIngredients: false }), "red");
  assert.equal(recipeCompletenessStatus({}, { hasIngredients: true, complete: false }), "yellow");
  assert.equal(recipeCompletenessStatus({}, { hasIngredients: true, complete: true }), "green");
});