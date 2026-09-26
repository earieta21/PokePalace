import { test } from "node:test";
import assert from "node:assert/strict";
import { inventoryDemandForItem, inventoryConsumptionStatus } from "../utils/inventoryConsumption.js";
import { getPosInventoryDemand } from "../config/posCatalog.js";

test("protein demand converts kilograms to the inventory unit and combines shared keys", () => {
  const demand = { tuna: 0.05, seared_tuna: 0.04 };
  assert.equal(inventoryDemandForItem({ unit: "kg", menuKeys: ["tuna", "seared_tuna"] }, demand).quantity, 0.09);
  assert.equal(inventoryDemandForItem({ unit: "g", menuKeys: ["tuna", "seared_tuna"] }, demand).quantity, 90);
});

test("bottled water deducts units and prepared water deducts the configured serving", () => {
  assert.equal(inventoryDemandForItem({ unit: "botellas", menuKeys: ["botella_de_agua"] }, { botella_de_agua: 3 }).quantity, 3);
  assert.equal(inventoryDemandForItem({ unit: "L", menuKeys: ["agua_natural"], quantityPerPortion: 0.5 }, { agua_natural: 3 }).quantity, 1.5);
  assert.equal(inventoryDemandForItem({ unit: "vasos", menuKeys: ["agua_natural"] }, { agua_natural: 3 }).quantity, 3);
});

test("agua del dia defaults to a 16 fl oz serving in litres or millilitres", () => {
  const litres = { unit: "L", menuKeys: ["agua_natural"] };
  assert.equal(inventoryDemandForItem(litres, { agua_natural: 1 }).quantity, 0.473176);
  assert.equal(inventoryDemandForItem(litres, { agua_natural: 3 }).quantity, 1.419528);
  assert.equal(inventoryDemandForItem({ ...litres, unit: "ml" }, { agua_natural: 2 }).quantity, 946.352);
  assert.equal(inventoryConsumptionStatus(litres).ready, true);
  assert.equal(inventoryDemandForItem({ ...litres, quantityPerPortion: 0.4 }, { agua_natural: 2 }).quantity, 0.8);
});

test("half bases consume half of their configured serving, without duplicate links", () => {
  const demand = getPosInventoryDemand({ bases: ["white_rice", "quinoa"], proteins: ["salmon"] });
  assert.equal(inventoryDemandForItem({ unit: "kg", menuKeys: ["white_rice", "white_rice"], quantityPerPortion: 0.18 }, demand).quantity, 0.09);
});

test("missing serving sizes never silently deduct an entire kilogram or litre", () => {
  for (const [key, unit] of [["cucumber", "kg"], ["ponzu_sauce", "L"], ["spicy_mayo", "botellas"]]) {
    const item = { unit, menuKeys: [key] };
    assert.deepEqual(inventoryDemandForItem(item, { [key]: 1 }), { quantity: 0, missingKeys: [key] });
    assert.equal(inventoryConsumptionStatus(item).ready, false);
  }
});

test("customer carts do not count legacy bowl and drink copies twice", () => {
  const bowl = { kind: "bowl", base: "white_rice", proteins: ["salmon"], complements: ["cucumber"] };
  const drink = { kind: "item", catalogId: "bottled-water", qty: 2 };
  const demand = getPosInventoryDemand({ ...bowl, items: [drink], cartItems: [bowl, drink] });
  assert.deepEqual(demand, { botella_de_agua: 2, cucumber: 1, salmon: 0.1, white_rice: 1 });
});

test("preset bowls and combo drinks respect the number sold", () => {
  const demand = getPosInventoryDemand({ items: [{ catalogId: "combo-palace", qty: 2,
    comboBowlId: "bowl-the-og", comboDrinkId: "agua-del-dia", comboRiceCakeId: "cacao-rice-cake" }] });
  assert.equal(demand.tuna, 0.1);
  assert.equal(demand.salmon, 0.1);
  assert.equal(inventoryDemandForItem({ unit: "L", menuKeys: ["agua_natural"], quantityPerPortion: 0.4 }, demand).quantity, 0.8);
});
