import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPLOYEE_DAILY_PROTEIN_GRAMS,
  gramsToInventoryQuantity,
  isProteinInventoryItem,
  normalizeInventoryCategory,
} from "../utils/staffConsumption.js";

test("consumo interno reconoce categorías de proteína heredadas y actuales", () => {
  assert.equal(normalizeInventoryCategory("Proteínas"), "proteinas");
  assert.equal(isProteinInventoryItem({ category: "Proteínas" }), true);
  assert.equal(isProteinInventoryItem({ category: "Proteins" }), true);
  assert.equal(isProteinInventoryItem({ category: "Verduras" }), false);
});

test("consumo interno convierte gramos a la unidad real de inventario", () => {
  assert.equal(EMPLOYEE_DAILY_PROTEIN_GRAMS, 50);
  assert.equal(gramsToInventoryQuantity(50, "kg"), 0.05);
  assert.equal(gramsToInventoryQuantity(50, "g"), 50);
  assert.equal(gramsToInventoryQuantity(50, "pz"), null);
  assert.equal(gramsToInventoryQuantity(0, "kg"), null);
});
