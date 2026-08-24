import assert from "node:assert/strict";
import test from "node:test";

import { elapsedOrderTime, orderTimingLabel } from "./orderTiming.js";

test("muestra el tiempo transcurrido de una orden inmediata", () => {
  const now = new Date("2026-07-21T20:10:45.000Z");
  assert.equal(elapsedOrderTime("2026-07-21T20:08:30.000Z", now), "2:15");
  assert.equal(orderTimingLabel({ createdAt: "2026-07-21T20:08:30.000Z" }, now), "2:15");
});

test("muestra la hora de recolección en vez de la antigüedad para una orden programada", () => {
  const label = orderTimingLabel({
    createdAt: "2026-07-20T18:00:00.000Z",
    scheduledPickupTime: "2026-07-21T21:30:00.000Z",
  });

  assert.match(label, /^Programado /);
  assert.doesNotMatch(label, /^\d+:/);
});

