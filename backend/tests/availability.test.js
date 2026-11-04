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
