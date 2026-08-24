import { test } from "node:test";
import assert from "node:assert/strict";

import {
  insufficientInventoryItems,
  trackedInventoryRequirements,
} from "../utils/inventoryStock.js";
import {
  SCHEDULED_ORDER_LEAD_TIME_MS,
  scheduledOrderVisibilityFilter,
} from "../utils/orderVisibility.js";
import {
  isPosBowlItem,
  isValidDoubleProteinRewardBowl,
} from "../utils/posRewards.js";

test("la ventana operativa de pedidos programados empieza 30 minutos antes", () => {
  const now = new Date("2026-07-21T18:00:00.000Z");
  const filter = scheduledOrderVisibilityFilter(now);

  assert.equal(SCHEDULED_ORDER_LEAD_TIME_MS, 30 * 60 * 1000);
  assert.deepEqual(filter.$or[0], { scheduledPickupTime: null });
  assert.equal(
    filter.$or[1].scheduledPickupTime.$lte.toISOString(),
    "2026-07-21T18:30:00.000Z"
  );
  assert.throws(() => scheduledOrderVisibilityFilter("fecha-inválida"), TypeError);
});

test("un artículo rastreado sin porciones suficientes se reporta completo", () => {
  const orderId = "order-1";
  const requirements = trackedInventoryRequirements(
    { salmon: 2, tofu: 1 },
    [{
      _id: "inventory-1",
      item: "Salmón",
      qty: 1,
      menuKeys: ["salmon"],
      processedOrderIds: [],
      deductedOrderIds: [],
      orderDeductions: [],
    }],
    orderId
  );

  assert.equal(requirements[0].requested, 2);
  assert.equal(requirements[0].available, 1);
  assert.deepEqual(insufficientInventoryItems(requirements), [{
    item: "Salmón",
    menuKeys: ["salmon"],
    required: 2,
    available: 1,
  }]);
});

test("los ingredientes no rastreados conservan compatibilidad", () => {
  const requirements = trackedInventoryRequirements(
    { tofu: 1 },
    [{
      _id: "inventory-1",
      item: "Salmón",
      qty: 0,
      menuKeys: ["salmon"],
    }],
    "order-1"
  );

  assert.deepEqual(requirements, []);
  assert.deepEqual(insufficientInventoryItems(requirements), []);
});

test("el ledger reconoce un descuento previo y hace el retry idempotente", () => {
  const requirements = trackedInventoryRequirements(
    { salmon: 2 },
    [{
      _id: "inventory-1",
      item: "Salmón",
      qty: 0,
      menuKeys: ["salmon"],
      processedOrderIds: ["order-1"],
      deductedOrderIds: ["order-1"],
      orderDeductions: [{ orderId: "order-1", quantity: 2 }],
    }],
    "order-1"
  );

  assert.equal(requirements[0].alreadyDeducted, true);
  assert.equal(requirements[0].ledgerMismatch, false);
  assert.deepEqual(insufficientInventoryItems(requirements), []);
});

test("Rewards identifica bowls por categoría aunque el nombre no diga bowl", () => {
  assert.equal(isPosBowlItem({ name: "Tofu cítrico", category: "bowls" }), true);
  assert.equal(isPosBowlItem({ name: "Bowl de edamame", category: "starters" }), false);
});

test("proteína doble exige bowl grande y una porción real de proteína elegida", () => {
  const valid = {
    bowlSize: "large",
    proteins: ["salmon", "tuna", "tofu"],
    extraScoopProteins: ["salmon"],
  };

  assert.equal(isValidDoubleProteinRewardBowl(valid), true);
  assert.equal(isValidDoubleProteinRewardBowl({ ...valid, extraScoopProteins: [] }), false);
  assert.equal(isValidDoubleProteinRewardBowl({ ...valid, extraScoopProteins: ["shrimp"] }), false);
  assert.equal(isValidDoubleProteinRewardBowl({ ...valid, bowlSize: "normal" }), false);
});

