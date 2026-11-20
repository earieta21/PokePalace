import { test } from "node:test";
import assert from "node:assert/strict";
import { portionCostOf, measureOf } from "../utils/portionCost.js";
import { preparationCost, withLivePrices } from "../utils/preparationCost.js";
import {
  RECIPE_PARTS,
  categoryCost,
  computeSharedParts,
  resolveIngredientCosts,
} from "../utils/bowlCosting.js";
import { planCostingTemplate, TEMPLATE_RECIPES, TEMPLATE_PORTIONS } from "../config/costingTemplate.js";
import { cleanPortion } from "../controllers/costingController.js";

const round = (n) => Math.round(n * 100) / 100;

test("la porción se cobra por lo que pesa, aunque se compre por kilo, pieza o botella", () => {
  // Pepino: 20 g a $29.90 el kg
  assert.equal(round(portionCostOf({ amount: 20, unit: "g" }, { price: 29.9, unit: "kg" }).cost), 0.6);
  // Aguacate: ¼ de pieza a $11 la pieza
  assert.equal(portionCostOf({ amount: 0.25, unit: "pz" }, { price: 11, unit: "pz" }).cost, 2.75);
  // Sriracha: 30 ml de una botella de 793 g a $80 (g ≈ ml)
  assert.equal(round(portionCostOf(
    { amount: 30, unit: "ml" },
    { price: 80, unit: "botellas", contentAmount: 793, contentUnit: "g" },
  ).cost), 3.03);
  // Litros del inventario ("L") y galones
  assert.equal(portionCostOf({ amount: 100, unit: "ml" }, { price: 40, unit: "L" }).cost, 4);
  assert.equal(measureOf("gal").base, 3785.41);
});

test("lo que falta se dice en palabras en vez de inventar un costo", () => {
  assert.match(portionCostOf({ amount: 0, unit: "g" }, { price: 10, unit: "kg" }).reason, /cuánto lleva una porción/);
  assert.match(portionCostOf({ amount: 20, unit: "g" }, { price: 0, unit: "kg" }).reason, /precio/);
  assert.match(portionCostOf({ amount: 1, unit: "pz" }, { price: 30, unit: "kg" }).reason, /gramos o ml/);
  assert.match(portionCostOf({ amount: 30, unit: "ml" }, { price: 80, unit: "botellas" }).reason, /cuánto trae cada botellas/);
});

test("una receta ligada al inventario usa el precio por kilo, no lo confunde con el paquete", () => {
  const inventory = new Map([
    ["crema", { _id: "crema", item: "Crema", unit: "kg", cost: 71.4 }],     // $357 el bote de 5 kg
    ["mayo", { _id: "mayo", item: "Mayonesa", unit: "botellas", cost: 134 }],
  ]);
  const prep = {
    yieldPortions: 10,
    ingredients: [
      // Antes: 417 g / (5 kg) × $71.40 = $5.95 — cinco veces menos.
      { name: "Crema", unit: "kg", presentation: 5, recipeAmount: 417, unitPrice: 0, inventoryItemId: "crema" },
      // Botella de 1 L ligada por pieza: 250 ml de una botella de 1000 ml.
      { name: "Mayonesa", unit: "ml", presentation: 1000, recipeAmount: 250, unitPrice: 0, inventoryItemId: "mayo" },
    ],
  };
  const cost = preparationCost(withLivePrices(prep, inventory));
  assert.equal(cost.lines[0].cost, round(0.417 * 71.4)); // $29.77
  assert.equal(cost.lines[1].cost, 33.5);                 // ¼ de botella
  assert.equal(cost.costPerPortion, round((29.77 + 33.5) / 10));
});

test("sin ligar al inventario la receta se calcula igual que la hoja", () => {
  const prep = { yieldPortions: 1, ingredients: [{ name: "Crema", unit: "kg", presentation: 5, recipeAmount: 417, unitPrice: 357 }] };
  assert.equal(preparationCost(withLivePrices(prep, new Map())).batchCost, 29.77);
});

test("el precio sale del inventario elegido, luego del que empata por nombre y al final del escrito a mano", () => {
  const inventoryItems = [
    { _id: "pep", item: "Pepino", unit: "kg", cost: 30 },
    { _id: "otro", item: "Pepino persa", unit: "kg", cost: 60 },
    { _id: "agu", item: "Aguacate", unit: "kg", cost: 55 },
  ];
  const portions = {
    cucumber: { amount: 20, unit: "g", price: 99, priceUnit: "kg" },                // empata por nombre → $30/kg
    red_onion: { amount: 20, unit: "g", price: 27, priceUnit: "kg" },               // sin inventario → a mano
    beet: { amount: 20, unit: "g", inventoryItemId: "otro" },                       // elegido a mano
    pineapple: { amount: 20, unit: "g", price: 65, priceUnit: "kg", useManualPrice: true },
    // Aguacate por pieza pero el inventario va en kg: no se puede, cae al precio a mano.
    avocado: { amount: 0.25, unit: "pz", price: 11, priceUnit: "pz" },
  };
  const costs = resolveIngredientCosts({ category: "complements", inventoryItems, portions });
  assert.equal(costs.cucumber.costPerPortion, 0.6);
  assert.equal(costs.cucumber.priceSource, "inventario");
  assert.equal(costs.red_onion.costPerPortion, 0.54);
  assert.equal(costs.red_onion.priceSource, "manual");
  assert.equal(costs.beet.costPerPortion, 1.2);
  assert.equal(costs.pineapple.costPerPortion, 1.3);
  assert.equal(costs.avocado.costPerPortion, 2.75);
  assert.equal(costs.avocado.priceSource, "manual");
  assert.equal(costs.mango.source, "falta");
  assert.match(costs.mango.reason, /porción/);
});

test("la receta manda sobre la porción y avisa si le falta rendimiento", () => {
  const costs = resolveIngredientCosts({
    category: "sauces",
    portions: { spicy_mayo: { amount: 30, unit: "ml", price: 500, priceUnit: "kg" } },
    recipeCosts: { spicy_mayo: 3.31 },
    recipeStatus: { cilantro_dressing: { id: "r1", name: "CILANTRO", missingYield: true } },
  });
  assert.equal(costs.spicy_mayo.costPerPortion, 3.31);
  assert.equal(costs.spicy_mayo.source, "receta");
  assert.equal(costs.cilantro_dressing.source, "falta");
  assert.match(costs.cilantro_dressing.reason, /rinde la receta "CILANTRO"/);
  assert.equal(costs.cilantro_dressing.recipeId, "r1");
});

test("lo que aún no tiene costo se estima con el promedio de lo que sí, no con un monto viejo", () => {
  const result = categoryCost({
    keys: ["a", "b", "c"],
    frequency: { a: 0.5, b: 0.3, c: 0 },
    costs: { a: 4 },
    fallbackPerServing: 134, // el monto viejo mal capturado ya no se usa
    fallbackTotal: 215.74,
  });
  assert.equal(result.cost, round(4 * 0.5 + 4 * 0.3));
  assert.equal(result.source, "mixto");
  assert.equal(result.estimateFrom, "promedio");
  assert.deepEqual(result.missing, [{ key: "b", frequency: 0.3 }]);

  // Si nada tiene costo todavía, se respeta lo de antes.
  assert.equal(categoryCost({ keys: ["a"], frequency: { a: 1 }, costs: {}, fallbackPerServing: 2 }).cost, 2);
  // Sin ventas: promedio conocido × cuántas lleva un bowl.
  assert.equal(categoryCost({ keys: ["a", "b"], costs: { a: 1, b: 3 }, unitsPerBowl: 2 }).cost, 4);
});

test("el marinado dulce del kiosco ya cuenta en el costeo", () => {
  assert.ok(RECIPE_PARTS.marinades.includes("sweet_marinade"));
});

test("el bowl usa el costo por porción de cada opción ponderado por lo que se pide", () => {
  const ingredientCosts = {
    base: { white_rice: { costPerPortion: 3 } },
    complements: { cucumber: { costPerPortion: 0.6 }, avocado: { costPerPortion: 2.75 } },
    sauces: { spicy_mayo: { costPerPortion: 3.31 } },
    marinades: {},
    toppings: { sesame_seeds: { costPerPortion: 0.48 } },
  };
  const usage = {
    bowls: 100,
    frequency: { cucumber: 0.5, avocado: 0.8 },
    frequencyBy: { base: { white_rice: 1 }, sauces: { spicy_mayo: 0.6 }, toppings: { sesame_seeds: 0.9 }, marinades: {} },
    averagePerBowl: { sauces: 0.6 },
    togoShare: 0.5,
    complementsCapFactor: 1,
  };
  const shared = computeSharedParts({ config: { disabledComplements: [] }, usage, ingredientCosts });
  assert.equal(shared.rows.base, 3);
  assert.equal(shared.rows.complements, round(0.6 * 0.5 + 2.75 * 0.8));
  assert.equal(shared.rows.sauces, round(3.31 * 0.6));
  assert.equal(shared.rows.toppings, round(0.48 * 0.9));
  assert.equal(shared.detail.complements.source, "completo");
});

test("la plantilla de la hoja solo llena lo que está vacío", () => {
  const empty = planCostingTemplate({});
  assert.equal(empty.recipes.length, TEMPLATE_RECIPES.length);
  assert.ok(empty.recipes.every((r) => r.action === "crear"));
  assert.equal(empty.portions.length, Object.keys(TEMPLATE_PORTIONS).length);
  assert.ok(empty.disposables.every((d) => d.action === "crear"));

  const partial = planCostingTemplate({
    preparations: [{ menuKey: "spicy_mayo" }],
    portions: { cucumber: { amount: 25, unit: "g" } },
    disposables: [{ _id: "x1", name: "BOWLS 32 OZ" }, { _id: "x2", name: "Servilletas" }],
    lines: [{ disposableId: "x2" }],
  });
  assert.equal(partial.recipes.find((r) => r.menuKey === "spicy_mayo").action, "existe");
  assert.equal(partial.portions.find((p) => p.key === "cucumber").action, "existe");
  assert.equal(partial.disposables.find((d) => d.name === "Bowl 32 oz").action, "agregar");
  assert.equal(partial.disposables.find((d) => d.name === "Servilleta blanca").action, "existe");
  assert.ok(partial.pending < empty.pending);
});

test("una porción capturada se limpia y una vacía se borra", () => {
  assert.equal(cleanPortion({ amount: 0, price: 0 }), null);
  assert.deepEqual(cleanPortion({ amount: "20", unit: "kg", price: "29.9", priceUnit: "lb", inventoryItemId: "nope" }), {
    amount: 20, unit: "g", inventoryItemId: null, price: 29.9, priceUnit: "kg",
    useManualPrice: false, contentAmount: 0, contentUnit: "g",
  });
  assert.equal(cleanPortion({ amount: 99999 }).amount, 5000);
});
