import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAvailabilityChange,
  applyLegacyAvailabilityList,
  availabilityLists,
  availabilityUpdate,
  effectiveUnavailableItems,
  todayUnavailableItems,
} from "../utils/availability.js";
import {
  getPosInventoryDemand,
  getUnavailableCatalogIds,
  getUnavailablePosSelections,
  withOmittedIngredients,
} from "../config/posCatalog.js";

// 4 nov 2026, 10:00 en Tijuana (UTC-8) y el día siguiente.
const NOV4 = new Date("2026-11-04T18:00:00Z");
const NOV5 = new Date("2026-11-05T18:00:00Z");
// 4 nov 23:30 en Tijuana: ya es 5 nov en UTC, pero sigue siendo el mismo día del local.
const NOV4_LATE = new Date("2026-11-05T07:30:00Z");

test("lo agotado de hoy se reinicia solo al día siguiente; lo de temporada no", () => {
  const settings = availabilityUpdate({ today: ["salmon"], season: ["mango"] }, NOV4);
  assert.equal(settings.unavailableItemsDay, "2026-11-04");

  assert.deepEqual(effectiveUnavailableItems(settings, NOV4).sort(), ["mango", "salmon"]);
  assert.deepEqual(effectiveUnavailableItems(settings, NOV4_LATE).sort(), ["mango", "salmon"]);
  assert.deepEqual(effectiveUnavailableItems(settings, NOV5), ["mango"]);
  assert.deepEqual(availabilityLists(settings, NOV5), {
    unavailableItems: ["mango"],
    todayUnavailableItems: [],
    seasonalUnavailableItems: ["mango"],
  });
});

test("una lista de antes del reinicio diario (sin fecha) se respeta", () => {
  assert.deepEqual(todayUnavailableItems({ unavailableItems: ["tuna"] }, NOV5), ["tuna"]);
  assert.deepEqual(effectiveUnavailableItems(null, NOV5), []);
});

test("cambiar un ingrediente no revive lo agotado de ayer ni toca lo demás", () => {
  const yesterday = availabilityUpdate({ today: ["salmon", "seaweed"], season: ["mango"] }, NOV4);

  assert.deepEqual(applyAvailabilityChange(yesterday, { id: "kale", status: "today" }, NOV5), {
    today: ["kale"],
    season: ["mango"],
  });

  const sameDay = availabilityUpdate({ today: ["salmon"], season: ["mango"] }, NOV5);
  assert.deepEqual(applyAvailabilityChange(sameDay, { id: "mango", status: "available" }, NOV5), {
    today: ["salmon"],
    season: [],
  });
  assert.deepEqual(applyAvailabilityChange(sameDay, { id: "salmon", status: "season" }, NOV5), {
    today: [],
    season: ["mango", "salmon"],
  });
  assert.deepEqual(applyAvailabilityChange(sameDay, { id: "salmon", status: "today" }, NOV5), {
    today: ["salmon"],
    season: ["mango"],
  });
});

test("una pantalla vieja que manda la lista completa no saca nada de temporada", () => {
  const settings = availabilityUpdate({ today: [], season: ["mango"] }, NOV5);
  assert.deepEqual(applyLegacyAvailabilityList(settings, ["mango", "salmon", "salmon", 7, " "]), {
    today: ["salmon"],
    season: ["mango"],
  });
  assert.deepEqual(applyLegacyAvailabilityList(settings, undefined), { today: [], season: ["mango"] });
});

test("sin mango el Skinny se vende sin él: no se apaga, la orden lo anota y no se descuenta", () => {
  assert.deepEqual(getUnavailableCatalogIds(["mango"]), []);
  assert.deepEqual(getUnavailableCatalogIds(["mango", "salmon"]), ["bowl-the-og"]);

  // Un bowl armado con mango sí se rechaza.
  assert.deepEqual(getUnavailablePosSelections({ bowl: { base: "white_rice", complements: ["mango"] }, unavailableItems: ["mango"] }), ["mango"]);

  const lines = withOmittedIngredients([
    { kind: "item", catalogId: "bowl-skinny", qty: 2, omit: ["tuna"] },
    { kind: "item", catalogId: "combo-palace", comboBowlId: "bowl-skinny", comboDrinkId: "coca-zero", qty: 1 },
    { kind: "item", catalogId: "bowl-the-og", qty: 1, omit: ["salmon"] },
    { kind: "bowl", base: "white_rice", complements: ["mango"] },
  ], ["mango"]);
  assert.deepEqual(lines.map((line) => line.omit), [["mango"], ["mango"], undefined, undefined]);
  assert.deepEqual(withOmittedIngredients([{ catalogId: "bowl-skinny", qty: 1 }], [])[0].omit, undefined);

  const demand = getPosInventoryDemand({ cartItems: lines.slice(0, 2) });
  assert.equal("mango" in demand, false);
  assert.equal(demand.coca_zero, 1);
  assert.ok(demand.avocado >= 3);
  assert.ok("mango" in getPosInventoryDemand({ cartItems: [{ kind: "item", catalogId: "bowl-skinny", qty: 1 }] }));
});
