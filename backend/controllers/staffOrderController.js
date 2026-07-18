import Order from "../models/Order.js";
import Inventory from "../models/Inventory.js";
import User from "../models/User.js";
import Expense from "../models/Expense.js";
import Redemption from "../models/Redemption.js";
import StoreSettings from "../models/StoreSettings.js";
import { sendSMS, sendWhatsApp } from "../utils/notify.js";
import { awardLoyaltyPoints } from "../utils/loyalty.js";
import { reconcileOnlineOrderCancellation } from "./orderController.js";
import { getRewardById } from "../config/rewardsCatalog.js";
import { computeBowlSubtotal } from "../pricing.js";
import {
  getPosInventoryDemand,
  getUnavailablePosSelections,
  POS_TOPPING_LABELS,
  PosOrderValidationError,
  normalizePosClientOrderId,
  resolvePosItems,
  sanitizePosBowl,
  sanitizePosRewardTopping,
} from "../config/posCatalog.js";
import {
  RESTAURANT_TIME_ZONE,
  dateKeyInTimeZone,
  dayRangeInTimeZone,
  nextDateKey,
  startOfDateKey,
  zonedParts,
} from "../utils/timeZone.js";

/* ── inventory auto-deduction ── */
async function deductInventory(order) {
  try {
    const statusBefore = await Order.findById(order._id).select("status").lean();
    if (!statusBefore || statusBefore.status === "cancelled") {
      if (statusBefore?.status === "cancelled") await restoreInventoryForOrder(order);
      return false;
    }

    const demand = getPosInventoryDemand(order);
    const keys = Object.keys(demand);

    if (keys.length === 0) {
      await Order.updateOne({ _id: order._id }, { $set: { ingredientsDeducted: true } });
      order.ingredientsDeducted = true;
      const statusAfter = await Order.findById(order._id).select("status").lean();
      if (statusAfter?.status === "cancelled") {
        await restoreInventoryForOrder(order);
        return false;
      }
      return true;
    }
    const invItems = await Inventory.find({ menuKeys: { $in: keys } })
      .select("menuKeys")
      .lean();
    if (invItems.length === 0) {
      await Order.updateOne({ _id: order._id }, { $set: { ingredientsDeducted: true } });
      order.ingredientsDeducted = true;
      const statusAfter = await Order.findById(order._id).select("status").lean();
      if (statusAfter?.status === "cancelled") {
        await restoreInventoryForOrder(order);
        return false;
      }
      return true;
    }

    // Each inventory document may represent more than one menu key (for
    // example raw tuna shared by tuna and seared_tuna). Calculate its complete
    // demand, then atomically decrement and store the exact quantity removed.
    // processedOrderIds keeps partial/ambiguous retries exactly once.
    const operations = invItems.flatMap((item) => {
      const requested = [...new Set(item.menuKeys || [])]
        .reduce((sum, key) => sum + (Number(demand[key]) || 0), 0);
      if (requested <= 0) return [];

      return [{
        updateOne: {
          filter: { _id: item._id, processedOrderIds: { $ne: order._id } },
          update: [{
            $set: {
              qty: {
                $max: [0, { $subtract: [{ $ifNull: ["$qty", 0] }, requested] }],
              },
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
        },
      }];
    });

    if (operations.length > 0) await Inventory.bulkWrite(operations, { ordered: false });

    // This marker is a summary only; the per-item ledgers are authoritative.
    // A crash here is repaired by the next safe retry.
    await Order.updateOne({ _id: order._id }, { $set: { ingredientsDeducted: true } });
    order.ingredientsDeducted = true;

    // Close the race where cancellation wins after our first status read but
    // before the inventory update. Restoration uses the same durable ledgers.
    const statusAfter = await Order.findById(order._id).select("status").lean();
    if (statusAfter?.status === "cancelled") {
      await restoreInventoryForOrder(order);
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

async function restoreInventoryForOrder(order) {
  try {
    await Inventory.updateMany(
      { processedOrderIds: order._id },
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
      }]
    );
    await Order.updateOne(
      { _id: order._id },
      {
        $set: { inventoryRestoredAt: new Date(), ingredientsDeducted: false },
      }
    );
    order.ingredientsDeducted = false;
    order.inventoryRestoredAt = new Date();
    return true;
  } catch (err) {
    console.error("restoreInventoryForOrder error:", err.message);
    return false;
  }
}

async function reverseLoyaltyForPosCancellation(order) {
  const earned = Math.max(0, Number(order.loyaltyPointsEarned) || 0);
  const userId = order.user?._id || order.user;
  const legacyCreditApplied = earned > 0 && (order.loyaltyCreditLedgerVersion || 0) < 1;
  if (userId) {
    const reversed = await User.updateOne(
      { _id: userId, cancelledPosCreditsReversed: { $ne: order._id } },
      [{
        $set: {
          points: {
            $cond: [
              {
                $or: [
                  legacyCreditApplied,
                  { $in: [order._id, { $ifNull: ["$loyaltyCreditedOrderIds", []] }] },
                ],
              },
              { $max: [0, { $subtract: [{ $ifNull: ["$points", 0] }, earned] }] },
              { $ifNull: ["$points", 0] },
            ],
          },
          lifetimePoints: {
            $cond: [
              {
                $or: [
                  legacyCreditApplied,
                  { $in: [order._id, { $ifNull: ["$loyaltyCreditedOrderIds", []] }] },
                ],
              },
              { $max: [0, { $subtract: [{ $ifNull: ["$lifetimePoints", 0] }, earned] }] },
              { $ifNull: ["$lifetimePoints", 0] },
            ],
          },
          cancelledPosCreditsReversed: {
            $concatArrays: [{ $ifNull: ["$cancelledPosCreditsReversed", []] }, [order._id]],
          },
          loyaltyCreditedOrderIds: {
            $filter: {
              input: { $ifNull: ["$loyaltyCreditedOrderIds", []] },
              as: "creditedOrderId",
              cond: { $ne: ["$$creditedOrderId", order._id] },
            },
          },
        },
      }]
    );

    if (reversed.matchedCount === 0) {
      const alreadyReversed = await User.exists({
        _id: userId,
        cancelledPosCreditsReversed: order._id,
      });
      if (!alreadyReversed) throw new Error("No se encontró la cuenta Rewards para revertir puntos");
    }
  }

  await Order.updateOne(
    { _id: order._id, loyaltyReversedAt: null },
    { $set: { loyaltyReversedAt: new Date(), loyaltyCreditLedgerVersion: 1 } }
  );
}

async function restoreRewardForPosCancellation(order) {
  if (order.rewardRedemption) {
    const redemption = await Redemption.findById(order.rewardRedemption);
    if (redemption?.status === "used" && String(redemption.order) === String(order._id)) {
      const nextStatus = redemption.expiresAt && redemption.expiresAt <= new Date()
        ? "expired"
        : "active";
      await Redemption.updateOne(
        { _id: redemption._id, status: "used", order: order._id },
        {
          $set: { status: nextStatus, usedAt: null, usedBy: null },
          $unset: { order: "" },
        }
      );
    } else if (redemption?.status === "used" && String(redemption.order) !== String(order._id)) {
      throw new Error("El premio de la venta pertenece a otra orden");
    }
  }

  await Order.updateOne(
    { _id: order._id, rewardRestoredAt: null },
    { $set: { rewardRestoredAt: new Date() } }
  );
}

async function reconcileCancelledPosOrder(order) {
  if (order.source !== "pos") return order;

  if (!await restoreInventoryForOrder(order)) {
    throw new Error("No se pudo devolver el inventario de la venta cancelada");
  }
  let latest = await Order.findById(order._id).populate("user", "name email");
  if (!latest) throw new Error("La venta desapareció durante la cancelación");

  await reverseLoyaltyForPosCancellation(latest);
  latest = await Order.findById(order._id).populate("user", "name email");
  await restoreRewardForPosCancellation(latest);

  return Order.findOneAndUpdate(
    { _id: order._id, status: "cancelled" },
    {
      $set: {
        posCancellationReversedAt: new Date(),
        cancelledAt: order.cancelledAt || new Date(),
      },
    },
    { new: true }
  ).populate("user", "name email");
}

async function reconcileCancelledStaffOrder(order) {
  if (order.source === "pos") return reconcileCancelledPosOrder(order);
  if (order.source !== "online") return order;

  if (!await restoreInventoryForOrder(order)) {
    throw new Error("No se pudo devolver el inventario de la orden cancelada");
  }
  let latest = await Order.findById(order._id).populate("user", "name email");
  if (!latest) throw new Error("La orden desapareció durante la cancelación");
  await reverseLoyaltyForPosCancellation(latest);
  latest = await Order.findById(order._id).populate("user", "name email");
  return reconcileOnlineOrderCancellation(latest);
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* GET /api/staff/orders/customers/search?q=...
   Staff-only lookup used to attach an existing Rewards account to a POS sale. */
export const searchRewardCustomers = async (req, res) => {
  try {
    const query = String(req.query.q || "").trim().slice(0, 80);
    if (query.length < 3) {
      return res.status(400).json({ message: "Escribe al menos 3 caracteres" });
    }

    const safeQuery = escapeRegex(query);
    const digits = query.replace(/\D/g, "");
    const filters = [
      { name: { $regex: safeQuery, $options: "i" } },
      { email: { $regex: safeQuery, $options: "i" } },
    ];
    if (digits.length >= 3) {
      filters.push({ phone: { $regex: digits.split("").join("\\D*"), $options: "i" } });
    }

    const customers = await User.find({ $or: filters })
      .select("name email phone points lifetimePoints")
      .sort({ name: 1 })
      .limit(8)
      .lean();

    return res.json({ customers });
  } catch (err) {
    return res.status(500).json({ message: "No se pudieron buscar clientes", err: err.message });
  }
};

/* ── helpers ── */
const shiftDateKey = (dateKey, days) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
};

const monthStartKeyAtOffset = (date, offset) => {
  const { year, month } = zonedParts(date, RESTAURANT_TIME_ZONE);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

async function consumeRedemptionForOrder(order, staffId) {
  if (!order.rewardRedemption) return true;
  const statusBefore = await Order.findById(order._id).select("status").lean();
  if (!statusBefore || statusBefore.status === "cancelled") return false;

  const alreadyConsumed = await Redemption.exists({
    _id: order.rewardRedemption,
    status: "used",
    order: order._id,
  });
  if (alreadyConsumed) {
    const latest = await Order.findById(order._id).select("status").lean();
    if (latest?.status === "cancelled") {
      await restoreRewardForPosCancellation(order);
      return false;
    }
    return true;
  }

  const consumed = await Redemption.findOneAndUpdate(
    { _id: order.rewardRedemption, status: "active", order: null },
    { status: "used", usedAt: new Date(), usedBy: staffId, order: order._id },
    { new: true }
  );
  if (consumed) {
    const latest = await Order.findById(order._id).select("status").lean();
    if (latest?.status === "cancelled") {
      await restoreRewardForPosCancellation(order);
      return false;
    }
    return true;
  }

  // Another retry may have completed the same transition between our read
  // and update; distinguish that success from a reward used by another order.
  const consumedByThisOrder = Boolean(await Redemption.exists({
    _id: order.rewardRedemption,
    status: "used",
    order: order._id,
  }));
  if (!consumedByThisOrder) return false;
  const latest = await Order.findById(order._id).select("status").lean();
  if (latest?.status === "cancelled") {
    await restoreRewardForPosCancellation(order);
    return false;
  }
  return true;
}

const KITCHEN_PRIVATE_ORDER_FIELDS = [
  "phone", "user", "staffId", "clientOrderId", "paymentMethod",
  "paymentStatus", "subtotal", "tax", "total", "discountAmount",
  "promoCode", "pointsRedeemed", "loyaltyPointsEarned", "rewardCode",
  "rewardRedemption", "clipPaymentRequestId", "clipPaymentUrl",
];

const orderResponseForRole = (order, role) => {
  if (role !== "kitchen" || !order) return order;
  const response = typeof order.toObject === "function" ? order.toObject() : { ...order };
  for (const field of KITCHEN_PRIVATE_ORDER_FIELDS) delete response[field];
  return response;
};

/* GET /api/staff/orders
   query: status (comma-separated), source, limit, skip */
export const getAllOrders = async (req, res) => {
  try {
    const { status, source, limit = 100, skip = 0 } = req.query;
    const validStatuses = new Set(["pending", "preparing", "ready", "completed", "cancelled"]);
    const requestedStatuses = typeof status === "string"
      ? status.split(",").filter((value) => validStatuses.has(value))
      : [];
    const requestedLimit = Number.parseInt(limit, 10);
    const requestedSkip = Number.parseInt(skip, 10);
    const isKitchen = req.staff.role === "kitchen";
    const maxLimit = isKitchen ? 50 : 200;
    const safeLimit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, maxLimit)
      : maxLimit;
    const safeSkip = Number.isInteger(requestedSkip) && requestedSkip >= 0
      ? requestedSkip
      : 0;
    const filter = {};
    if (isKitchen) {
      const kitchenStatuses = new Set(["pending", "preparing", "ready"]);
      const allowedRequested = requestedStatuses.filter((value) => kitchenStatuses.has(value));
      filter.status = {
        $in: requestedStatuses.length > 0 ? allowedRequested : [...kitchenStatuses],
      };
    } else if (requestedStatuses.length > 0) {
      filter.status = { $in: requestedStatuses };
    }
    if (source) filter.source = source;

    let query = Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(safeSkip)
      .limit(safeLimit);

    if (isKitchen) {
      // Kitchen needs preparation details, not customer contact, account or
      // payment data. Enforce the reduced response even for a stale client.
      query = query.select(KITCHEN_PRIVATE_ORDER_FIELDS.map((field) => `-${field}`).join(" "));
    } else {
      query = query.populate("user", "name email");
    }

    const orders = await query;

    res.json({ orders });
  } catch (err) {
    res.status(500).json({ message: "Error fetching orders", err: err.message });
  }
};

/* PATCH /api/staff/orders/:id/pay — body opcional: { method: "cash" | "card_terminal" }
   Registrar CÓMO se pagó permite cuadrar caja (efectivo) contra terminal. */
export const markAsPaid = async (req, res) => {
  try {
    const PAY_METHODS = ["cash", "card_terminal"];
    const method = PAY_METHODS.includes(req.body?.method) ? req.body.method : null;

    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: { $ne: "cancelled" } },
      { paymentStatus: "paid", ...(method ? { paymentMethod: method } : {}) },
      { new: true }
    ).populate("user", "name email");
    if (!order) {
      const exists = await Order.exists({ _id: req.params.id });
      return res.status(exists ? 409 : 404).json({
        message: exists ? "Una orden cancelada no puede cobrarse" : "Orden no encontrada",
      });
    }

    if (!await deductInventory(order)) {
      return res.status(503).json({
        message: "El pago fue guardado, pero el inventario sigue conciliándose. Reintenta.",
        retryable: true,
        orderId: order._id,
      });
    }
    const loyalty = await awardLoyaltyPoints(order);

    res.json({ order, loyalty });
  } catch (err) {
    res.status(500).json({ message: "Error al marcar pago", err: err.message });
  }
};

/* PATCH /api/staff/orders/:id/status */
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const VALID = ["pending", "preparing", "ready", "completed", "cancelled"];
    if (!VALID.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const prev = await Order.findById(req.params.id);
    if (!prev) return res.status(404).json({ message: "Order not found" });

    const kitchenTransitions = {
      pending: "preparing",
      preparing: "ready",
    };
    const transitions = {
      pending: ["preparing", "cancelled"],
      preparing: ["ready", "cancelled"],
      ready: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };

    if (req.staff.role === "kitchen" && kitchenTransitions[prev.status] !== status) {
      return res.status(403).json({ message: "Cocina solo puede avanzar a preparación o listo" });
    }

    if (status === prev.status) {
      if (status === "cancelled") {
        const reconciled = await reconcileCancelledStaffOrder(prev);
        return res.json({
          order: orderResponseForRole(reconciled, req.staff.role),
          loyalty: null,
          idempotent: true,
        });
      }
      let loyalty = null;
      if (status === "completed") {
        if (!await deductInventory(prev)) {
          return res.status(503).json({
            message: "La orden quedó completada, pero el inventario sigue conciliándose. Reintenta.",
            retryable: true,
            orderId: prev._id,
          });
        }
        loyalty = await awardLoyaltyPoints(prev);
      }
      return res.json({
        order: orderResponseForRole(prev, req.staff.role),
        loyalty,
        idempotent: true,
      });
    }

    if (!transitions[prev.status]?.includes(status)) {
      return res.status(409).json({ message: "La orden no puede cambiar a ese estado" });
    }

    let order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: prev.status },
      {
        status,
        ...(status === "completed" ? { paymentStatus: "paid" } : {}),
        ...(status === "cancelled" ? { cancelledAt: new Date() } : {}),
      },
      { new: true }
    ).populate("user", "name email");

    if (!order) {
      const latest = await Order.findById(req.params.id).populate("user", "name email");
      if (latest?.status === status) {
        if (status === "cancelled") order = await reconcileCancelledStaffOrder(latest);
        let loyalty = null;
        if (status === "completed") {
          if (!await deductInventory(latest)) {
            return res.status(503).json({
              message: "La orden quedó completada, pero el inventario sigue conciliándose. Reintenta.",
              retryable: true,
              orderId: latest._id,
            });
          }
          loyalty = await awardLoyaltyPoints(latest);
        }
        return res.json({
          order: orderResponseForRole(order || latest, req.staff.role),
          loyalty,
          idempotent: true,
        });
      }
      return res.status(409).json({ message: "La orden cambió de estado; actualiza e intenta de nuevo" });
    }

    if (status === "cancelled") order = await reconcileCancelledStaffOrder(order);
    if (status === "completed" && !await deductInventory(order)) {
      return res.status(503).json({
        message: "La orden quedó completada, pero el inventario sigue conciliándose. Reintenta.",
        retryable: true,
        orderId: order._id,
      });
    }
    const loyalty = status === "completed" ? await awardLoyaltyPoints(order) : null;

    res.json({ order: orderResponseForRole(order, req.staff.role), loyalty });

    // Aviso al cliente cuando su pedido pasa a "listo" (una sola vez, solo pedidos online).
    // Intenta WhatsApp primero; si no está configurado o falla, cae a SMS.
    if (status === "ready" && prev.status !== "ready" && order.source === "online" && order.phone) {
      const num = String(order._id).slice(-5).toUpperCase();
      const template = process.env.WHATSAPP_TEMPLATE_READY || "pedido_listo";
      sendWhatsApp(order.phone, template, [num])
        .then((sent) => {
          if (!sent) {
            return sendSMS(
              order.phone,
              `Poke Palace: ¡Tu pedido #${num} está listo! 🥢 Pasa a recogerlo. Plaza La Estación, Local 24.`
            );
          }
        })
        .catch((err) => console.error("ready notification error:", err.message));
    }
  } catch (err) {
    res.status(500).json({ message: "Error updating order", err: err.message });
  }
};

/* GET /api/staff/orders/stats — today's KPIs */
export const getOrderStats = async (req, res) => {
  try {
    const { start, end } = dayRangeInTimeZone(new Date(), RESTAURANT_TIME_ZONE);
    const orders = await Order.find({ createdAt: { $gte: start, $lt: end } });
    const nonCancelledOrders = orders.filter((order) => order.status !== "cancelled");

    const revenue = nonCancelledOrders
      .filter((o) => o.paymentStatus === "paid" && o.total != null)
      .reduce((s, o) => s + o.total, 0);

    res.json({
      total:     nonCancelledOrders.length,
      pending:   nonCancelledOrders.filter((o) => o.status === "pending").length,
      preparing: nonCancelledOrders.filter((o) => o.status === "preparing").length,
      ready:     nonCancelledOrders.filter((o) => o.status === "ready").length,
      completed: nonCancelledOrders.filter((o) => o.status === "completed").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
      revenue:   parseFloat(revenue.toFixed(2)),
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching stats", err: err.message });
  }
};

/* POST /api/staff/orders — POS order.
   Supports quick-menu items, a cashier-built custom bowl, or both in one ticket. */
export const createPosOrder = async (req, res) => {
  let cleanClientOrderId = null;
  try {
    const {
      items, customer, phone, notes, fulfillment, paymentMethod, rewardCode, customerUserId,
      base, proteins, marinades, complements, sauces, toppings, clientOrderId, rewardTopping,
    } = req.body;

    try {
      cleanClientOrderId = normalizePosClientOrderId(clientOrderId);
    } catch (validationError) {
      return res.status(400).json({ message: validationError.message });
    }

    if (cleanClientOrderId) {
      const existing = await Order.findOne({ clientOrderId: cleanClientOrderId })
        .populate("user", "name email");
      if (existing) {
        if (existing.source !== "pos") {
          return res.status(409).json({ message: "clientOrderId ya pertenece a otra venta" });
        }
        if (existing.status === "cancelled") {
          const reconciled = await reconcileCancelledPosOrder(existing);
          return res.status(200).json({ order: reconciled, loyalty: null, idempotent: true });
        }
        if (!await consumeRedemptionForOrder(existing, existing.staffId || req.staff.id)) {
          return res.status(409).json({
            message: "No se pudo conciliar el premio de esta venta; requiere revisión",
            orderId: existing._id,
          });
        }
        if (!await deductInventory(existing)) {
          return res.status(503).json({
            message: "La venta existe, pero aún se está conciliando. Reintenta con el mismo clientOrderId.",
            retryable: true,
          });
        }
        const loyalty = await awardLoyaltyPoints(existing);
        return res.status(200).json({ order: existing, loyalty, idempotent: true });
      }
    }

    let safeItems;
    let safeBowl = null;
    let safeRewardTopping = null;
    try {
      safeItems = resolvePosItems(items === undefined ? [] : items);
      const wantsCustomBowl = base !== undefined || proteins !== undefined;
      if (wantsCustomBowl) {
        safeBowl = sanitizePosBowl({ base, proteins, marinades, complements, sauces, toppings });
      }
      if (rewardTopping !== undefined && rewardTopping !== null && rewardTopping !== "") {
        safeRewardTopping = sanitizePosRewardTopping(rewardTopping);
      }
    } catch (validationError) {
      if (validationError instanceof PosOrderValidationError) {
        return res.status(400).json({ message: validationError.message });
      }
      throw validationError;
    }

    const hasItems = safeItems.length > 0;
    const hasBowl = Boolean(safeBowl);
    if (!hasItems && !hasBowl) {
      return res.status(400).json({ message: "items or a custom bowl are required" });
    }

    const storeSettings = await StoreSettings.findOne({ key: "main" })
      .select("unavailableItems")
      .lean();
    const unavailableSelections = getUnavailablePosSelections({
      items: safeItems,
      bowl: safeBowl,
      rewardTopping: safeRewardTopping,
      unavailableItems: storeSettings?.unavailableItems,
    });
    if (unavailableSelections.length > 0) {
      return res.status(409).json({
        message: "La venta contiene un producto o ingrediente marcado como agotado",
        unavailableItems: unavailableSelections,
      });
    }

    const itemsSubtotal = safeItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const customBowlPrice = hasBowl
      ? computeBowlSubtotal(safeBowl.bowlSize)
      : 0;
    const subtotal = itemsSubtotal + customBowlPrice;

    let redemption = null;
    let rewardDiscount = 0;
    let rewardInstruction = null;
    const cleanRewardCode = rewardCode?.trim().toUpperCase();
    if (cleanRewardCode) {
      redemption = await Redemption.findOne({ code: cleanRewardCode, status: "active" });
      if (!redemption || (redemption.expiresAt && redemption.expiresAt <= new Date())) {
        return res.status(400).json({ message: "Código de premio inválido o vencido" });
      }
      const reward = getRewardById(redemption.rewardId);
      if (!reward) return res.status(400).json({ message: "Premio no disponible" });
      if (safeRewardTopping && reward.type !== "extra_topping") {
        return res.status(400).json({ message: "El topping seleccionado no corresponde a este premio" });
      }

      const bowlItems = safeItems.filter((item) => item.category === "bowls");
      const orderHasBowl = hasBowl || bowlItems.length > 0;
      if (!orderHasBowl) {
        return res.status(400).json({ message: "Este premio requiere un bowl en la orden" });
      }

      if (reward.type === "free_drink") {
        const drinks = safeItems.filter((item) => item.rewardDrink);
        if (!drinks.length) {
          return res.status(400).json({ message: "Agrega Agua de Coco o Limonada de Matcha a la orden" });
        }
        rewardDiscount = Math.min(...drinks.map((item) => item.price));
      } else if (reward.type === "extra_topping") {
        if (!safeRewardTopping) {
          return res.status(400).json({
            message: "Selecciona el topping extra elegido por el cliente",
          });
        }
        // Toppings are included in the bowl price, so there is no honest peso
        // discount to apply. Persist the exact choice for KDS and inventory.
        rewardInstruction = `PREMIO REWARDS: agregar 1 porción extra de ${POS_TOPPING_LABELS[safeRewardTopping]}.`;
      } else if (reward.type === "double_protein") {
        if (!hasBowl || safeBowl.proteins.length < 3) {
          return res.status(400).json({ message: "Proteína doble requiere un bowl personalizado grande" });
        }
        rewardDiscount = 40;
      } else if (reward.type === "free_bowl") {
        const eligibleBowlPrice = hasBowl ? customBowlPrice : Math.min(...bowlItems.map((item) => item.price));
        rewardDiscount = Math.min(249, eligibleBowlPrice);
      }
      rewardDiscount = Math.min(rewardDiscount, subtotal);
    }
    if (!cleanRewardCode && safeRewardTopping) {
      return res.status(400).json({ message: "Un topping de premio requiere un código Rewards activo" });
    }

    const total = Math.max(0, subtotal - rewardDiscount);

    let linkedCustomer = null;
    if (customerUserId) {
      linkedCustomer = await User.findById(customerUserId).select("name email phone points lifetimePoints");
      if (!linkedCustomer) {
        return res.status(400).json({ message: "La cuenta Rewards seleccionada ya no existe" });
      }
    }

    const resolvedPaymentMethod = paymentMethod || "card_terminal";
    const paymentStatus = resolvedPaymentMethod === "pay_at_pickup" ? "pending" : "paid";
    const cleanNotes = typeof notes === "string" ? notes.trim().slice(0, 500) : "";
    const orderNotes = [cleanNotes, rewardInstruction].filter(Boolean).join("\n") || null;

    const order = await Order.create({
      staffId: req.staff.id,
      clientOrderId: cleanClientOrderId,
      user: linkedCustomer?._id || null,
      items: safeItems,
      customer: customer || linkedCustomer?.name || "Walk-in",
      phone: phone || linkedCustomer?.phone || null,
      notes: orderNotes,
      fulfillment: fulfillment || "pickup",
      paymentMethod: resolvedPaymentMethod,
      paymentStatus,
      source: "pos",
      subtotal,
      discountAmount: rewardDiscount,
      total,
      rewardRedemption: redemption?._id || null,
      rewardCode: redemption?.code || null,
      rewardExtraTopping: safeRewardTopping,
      status: "pending",
      ...(hasBowl && {
        base: safeBowl.base,
        protein: safeBowl.proteins.join(", "),
        proteins: safeBowl.proteins,
        bowlSize: safeBowl.bowlSize,
        proteinUpcharge: safeBowl.proteins.length === 3 ? 1 : 0,
        marinades: safeBowl.marinades,
        complements: safeBowl.complements,
        sauces: safeBowl.sauces,
        toppings: safeBowl.toppings,
      }),
    });

    if (redemption) {
      if (!await consumeRedemptionForOrder(order, req.staff.id)) {
        const latest = await Order.findById(order._id).populate("user", "name email");
        if (latest?.status === "cancelled") {
          const reconciled = await reconcileCancelledPosOrder(latest);
          return res.status(409).json({
            message: "La venta fue cancelada mientras se conciliaba",
            order: reconciled,
          });
        }
        await Order.findOneAndDelete({
          _id: order._id,
          status: "pending",
          ingredientsDeducted: false,
          loyaltyPointsEarned: 0,
        });
        return res.status(409).json({ message: "Este premio ya fue usado en otra orden" });
      }
    }

    // Paid POS sales credit Rewards immediately. Pending sales do it later
    // through /pay or when the order is completed.
    if (!await deductInventory(order)) {
      return res.status(503).json({
        message: "La venta fue guardada, pero aún se está conciliando. Reintenta con el mismo clientOrderId.",
        retryable: Boolean(cleanClientOrderId),
      });
    }
    const loyalty = await awardLoyaltyPoints(order);

    res.status(201).json({ order, loyalty });
  } catch (err) {
    if (err?.code === 11000 && cleanClientOrderId) {
      try {
        const existing = await Order.findOne({ clientOrderId: cleanClientOrderId })
          .populate("user", "name email");
        if (existing?.source === "pos") {
          if (existing.status === "cancelled") {
            const reconciled = await reconcileCancelledPosOrder(existing);
            return res.status(200).json({ order: reconciled, loyalty: null, idempotent: true });
          }
          if (!await consumeRedemptionForOrder(existing, existing.staffId || req.staff.id)) {
            return res.status(409).json({
              message: "No se pudo conciliar el premio de esta venta; requiere revisión",
              orderId: existing._id,
            });
          }
          if (!await deductInventory(existing)) {
            return res.status(503).json({
              message: "La venta existe, pero aún se está conciliando. Reintenta con el mismo clientOrderId.",
              retryable: true,
            });
          }
          const loyalty = await awardLoyaltyPoints(existing);
          return res.status(200).json({ order: existing, loyalty, idempotent: true });
        }
      } catch (reconcileError) {
        console.error("POS idempotency reconciliation error:", reconcileError.message);
        return res.status(503).json({
          message: "La venta existe, pero aún se está conciliando. Reintenta con el mismo clientOrderId.",
          retryable: true,
        });
      }
      return res.status(409).json({ message: "clientOrderId ya pertenece a otra venta" });
    }
    res.status(500).json({ message: "Error creating POS order", err: err.message });
  }
};

/* GET /api/staff/analytics — aggregate data for analytics page */
export const getAnalytics = async (req, res) => {
  try {
    // Last 7 days
    const days = [];
    const currentDateKey = dateKeyInTimeZone(new Date(), RESTAURANT_TIME_ZONE);
    for (let i = 6; i >= 0; i--) {
      const dateKey = shiftDateKey(currentDateKey, -i);
      const start = startOfDateKey(dateKey, RESTAURANT_TIME_ZONE);
      const end = startOfDateKey(nextDateKey(dateKey), RESTAURANT_TIME_ZONE);

      const dayOrders = await Order.find({
        createdAt: { $gte: start, $lt: end },
        status: { $ne: "cancelled" },
      });

      const rev = dayOrders
        .filter((o) => o.paymentStatus === "paid" && o.total != null)
        .reduce((s, o) => s + o.total, 0);

      days.push({
        day: new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          timeZone: RESTAURANT_TIME_ZONE,
        }).format(start),
        orders: dayOrders.length,
        revenue: parseFloat(rev.toFixed(2)),
      });
    }

    // Top proteins (from bowl orders)
    const proteinAgg = await Order.aggregate([
      { $match: { status: { $ne: "cancelled" }, proteins: { $exists: true, $ne: [] } } },
      { $unwind: "$proteins" },
      { $group: { _id: "$proteins", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // Peak hours (last 30 days)
    const thirtyDaysAgo = startOfDateKey(
      shiftDateKey(currentDateKey, -29),
      RESTAURANT_TIME_ZONE
    );

    const hourAgg = await Order.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, status: { $ne: "cancelled" } } },
      {
        $group: {
          _id: { $hour: { date: "$createdAt", timezone: RESTAURANT_TIME_ZONE } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill all 24 hours
    const hourMap = {};
    hourAgg.forEach((h) => { hourMap[h._id] = h.count; });
    const peakHours = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: hourMap[h] ?? 0,
    })).filter((h) => h.hour >= 10 && h.hour <= 21); // restaurant hours

    // Top POS items (flat items array)
    const posItemAgg = await Order.aggregate([
      { $match: { source: "pos", status: { $ne: "cancelled" }, items: { $not: { $size: 0 } } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          count: { $sum: { $ifNull: ["$items.qty", 1] } },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "paid"] },
                { $multiply: ["$items.price", { $ifNull: ["$items.qty", 1] }] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    res.json({ days, topProteins: proteinAgg, peakHours, topPosItems: posItemAgg });
  } catch (err) {
    res.status(500).json({ message: "Error fetching analytics", err: err.message });
  }
};

/* GET /api/staff/finance — monthly aggregates (last 6 months) */
export const getFinance = async (req, res) => {
  try {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const monthStartKey = monthStartKeyAtOffset(now, -i);
      const nextMonthStartKey = monthStartKeyAtOffset(now, -i + 1);
      const start = startOfDateKey(monthStartKey, RESTAURANT_TIME_ZONE);
      const end = startOfDateKey(nextMonthStartKey, RESTAURANT_TIME_ZONE);

      // YYYY-MM prefix for string-date Expense docs
      const monthPrefix = monthStartKey.slice(0, 7);
      const nextPrefix = nextMonthStartKey.slice(0, 7);

      const [monthOrders, expenses] = await Promise.all([
        Order.find({
          createdAt: { $gte: start, $lt: end },
          status: { $ne: "cancelled" },
        }),
        Expense.find({ date: { $gte: monthPrefix + "-01", $lt: nextPrefix + "-01" } }),
      ]);

      const revenue = monthOrders
        .filter((o) => o.paymentStatus === "paid" && o.total != null)
        .reduce((s, o) => s + o.total, 0);
      const costs = expenses.reduce((s, e) => s + e.amount, 0);

      months.push({
        month: new Intl.DateTimeFormat("en-US", {
          month: "short",
          timeZone: RESTAURANT_TIME_ZONE,
        }).format(start),
        orders: monthOrders.length,
        revenue: parseFloat(revenue.toFixed(2)),
        costs:   parseFloat(costs.toFixed(2)),
        profit:  parseFloat((revenue - costs).toFixed(2)),
      });
    }

    res.json({ months });
  } catch (err) {
    res.status(500).json({ message: "Error fetching finance", err: err.message });
  }
};
