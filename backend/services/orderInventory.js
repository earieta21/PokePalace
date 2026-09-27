import Order from "../models/Order.js";
import Inventory from "../models/Inventory.js";
import { getPosInventoryDemand } from "../config/posCatalog.js";
import { actorFromStaff } from "../utils/auditLog.js";
import { recordInventoryMovement, restoreAmountForOrder } from "../utils/inventoryLedger.js";
import { inventoryDemandForItem } from "../utils/inventoryConsumption.js";

/* ── inventory auto-deduction ── */
export async function deductInventory(order, actor = null) {
  try {
    const statusBefore = await Order.findById(order._id).select("status ingredientsDeducted").lean();
    if (!statusBefore || statusBefore.status === "cancelled") {
      if (statusBefore?.status === "cancelled") await restoreInventoryForOrder(order, actor);
      return false;
    }
    if (statusBefore.ingredientsDeducted) return true;

    const demand = getPosInventoryDemand(order);
    const keys = Object.keys(demand);

    const invItems = await Inventory.find({ menuKeys: { $in: keys } })
      .select("menuKeys qty item unit quantityPerPortion processedOrderIds")
      .lean();

    // Returning the document before each atomic decrement keeps movements
    // accurate even when two sales consume the same stock concurrently.
    for (const item of invItems) {
      const { quantity: requested, missingKeys } = inventoryDemandForItem(item, demand);
      if (missingKeys.length) console.warn("Inventory portion missing:", item._id, missingKeys);
      const before = await Inventory.findOneAndUpdate(
          { _id: item._id, processedOrderIds: { $ne: order._id } },
          [{
            $set: {
              qty: { $round: [{ $max: [0, { $subtract: [{ $ifNull: ["$qty", 0] }, requested] }] }, 6] },
              orderDeductions: {
                $cond: [
                  { $gt: [{ $ifNull: ["$qty", 0] }, 0] },
                  {
                    $concatArrays: [
                      { $ifNull: ["$orderDeductions", []] },
                      [{
                        orderId: order._id,
                        quantity: {
                          $min: [
                            { $max: [0, { $ifNull: ["$qty", 0] }] },
                            requested,
                          ],
                        },
                      }],
                    ],
                  },
                  { $ifNull: ["$orderDeductions", []] },
                ],
              },
              deductedOrderIds: {
                $cond: [
                  { $gt: [{ $ifNull: ["$qty", 0] }, 0] },
                  { $setUnion: [{ $ifNull: ["$deductedOrderIds", []] }, [order._id]] },
                  { $ifNull: ["$deductedOrderIds", []] },
                ],
              },
              processedOrderIds: {
                $setUnion: [{ $ifNull: ["$processedOrderIds", []] }, [order._id]],
              },
            },
          }],
          { new: false }
      ).lean();
      if (before && requested > 0) {
        const qtyBefore = Number(before.qty) || 0;
        const qtyAfter = Number(Math.max(0, qtyBefore - requested).toFixed(6));
        await recordInventoryMovement({
          itemId: item._id, itemName: item.item, type: "sale_deduction",
          delta: qtyAfter - qtyBefore, qtyBefore, qtyAfter,
          reason: requested > qtyBefore ? `Existencia insuficiente: consumo de ${requested} ${item.unit}, disponible ${qtyBefore} ${item.unit}` : "",
          ...actorFromStaff(actor), reference: String(order._id), referenceType: "order",
          idempotencyKey: `deduct:${order._id}:${item._id}`,
        });
      }
    }

    // Seal successful reconciliation so later recipe/link edits cannot charge
    // historical orders again. Before this point, per-item markers allow retries.
    await Order.updateOne({ _id: order._id }, { $set: { ingredientsDeducted: true } });
    order.ingredientsDeducted = true;

    // Close the race where cancellation wins after our first status read but
    // before the inventory update. Restoration uses the same durable ledgers.
    const statusAfter = await Order.findById(order._id).select("status").lean();
    if (statusAfter?.status === "cancelled") {
      await restoreInventoryForOrder(order, actor);
      return false;
    }
    return true;
  } catch (err) {
    // Never roll the ledger back: the inventory command may have succeeded
    // despite a network error. Retrying is safe and completes only missing docs.
    console.error("deductInventory error:", err.message);
    return false;
  }
}

export async function restoreInventoryForOrder(order, actor = null) {
  try {
    const affected = await Inventory.find({ processedOrderIds: order._id })
      .select("item qty orderDeductions deductedOrderIds")
      .lean();

    const restored = [];
    for (const item of affected) {
      const before = await Inventory.findOneAndUpdate(
      { _id: item._id, processedOrderIds: order._id },
      [{
        $set: {
          qty: {
            $let: {
              vars: {
                matchingDeductions: {
                  $filter: {
                    input: { $ifNull: ["$orderDeductions", []] },
                    as: "deduction",
                    cond: { $eq: ["$$deduction.orderId", order._id] },
                  },
                },
              },
              in: {
                $add: [
                  { $ifNull: ["$qty", 0] },
                  {
                    $cond: [
                      { $gt: [{ $size: "$$matchingDeductions" }, 0] },
                      {
                        $sum: {
                          $map: {
                            input: "$$matchingDeductions",
                            as: "deduction",
                            in: { $ifNull: ["$$deduction.quantity", 0] },
                          },
                        },
                      },
                      {
                        // Compatibility with orders deducted before the exact
                        // quantity ledger existed: those always removed one.
                        $cond: [
                          { $in: [order._id, { $ifNull: ["$deductedOrderIds", []] }] },
                          1,
                          0,
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
          processedOrderIds: {
            $filter: {
              input: { $ifNull: ["$processedOrderIds", []] },
              as: "processedOrderId",
              cond: { $ne: ["$$processedOrderId", order._id] },
            },
          },
          deductedOrderIds: {
            $filter: {
              input: { $ifNull: ["$deductedOrderIds", []] },
              as: "deductedOrderId",
              cond: { $ne: ["$$deductedOrderId", order._id] },
            },
          },
          orderDeductions: {
            $filter: {
              input: { $ifNull: ["$orderDeductions", []] },
              as: "deduction",
              cond: { $ne: ["$$deduction.orderId", order._id] },
            },
          },
        },
      }],
      { new: false }
    ).select("item qty orderDeductions deductedOrderIds").lean();
      if (before) restored.push(before);
    }
    await Order.updateOne(
      { _id: order._id },
      {
        $set: { inventoryRestoredAt: new Date(), ingredientsDeducted: false },
      }
    );
    order.ingredientsDeducted = false;
    order.inventoryRestoredAt = new Date();

    const ledgerActor = actorFromStaff(actor);
    await Promise.all(restored.map((doc) => {
      const restoreAmount = restoreAmountForOrder(doc, order._id);
      if (restoreAmount <= 0) return null;
      const qtyBefore = Number(doc.qty) || 0;
      return recordInventoryMovement({
        itemId: doc._id, itemName: doc.item, type: "sale_reversal",
        delta: restoreAmount, qtyBefore, qtyAfter: qtyBefore + restoreAmount,
        ...ledgerActor, reference: String(order._id), referenceType: "order",
        idempotencyKey: `restore:${order._id}:${doc._id}`,
      });
    }));

    return true;
  } catch (err) {
    console.error("restoreInventoryForOrder error:", err.message);
    return false;
  }
}
