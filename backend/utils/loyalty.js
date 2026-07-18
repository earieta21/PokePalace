import User from "../models/User.js";
import Order from "../models/Order.js";

// Nivel Oro: se calcula con lifetimePoints (solo sube), nunca con el saldo gastable
export const GOLD_TIER_MIN_POINTS = 300;
export const GOLD_POINTS_MULTIPLIER = 2;

// Saldo gastable: se resetea si el cliente no gana puntos nuevos en este tiempo
export const POINTS_INACTIVITY_MONTHS = 12;

// Código de premio ya canjeado: vence si el cliente no lo reclama en este tiempo
export const REDEMPTION_CODE_EXPIRY_DAYS = 90;

/* Resetea a 0 el saldo gastable de un usuario si lleva más de
   POINTS_INACTIVITY_MONTHS sin ganar puntos nuevos. No toca lifetimePoints
   (el nivel es un logro permanente). Atómico y seguro de llamar repetidas
   veces — el filtro $type:"date" evita afectar cuentas que nunca han
   ganado puntos (pointsLastEarnedAt sigue en null). */
export async function expireStalePoints(userId) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - POINTS_INACTIVITY_MONTHS);

  await User.updateOne(
    {
      _id: userId,
      points: { $gt: 0 },
      pointsLastEarnedAt: { $type: "date", $lt: cutoff },
    },
    { $set: { points: 0 } }
  );
}

/* Credits one paid order exactly once. loyaltyPointsEarned is claimed before
   touching the user balance, so repeated clicks and simultaneous requests are
   harmless. If the user update fails, the order is rolled back for retry. */
export async function awardLoyaltyPoints(order) {
  const userId = order.user?._id || order.user;
  if (
    !userId || !order.total || order.total <= 0 ||
    order.paymentStatus !== "paid" || order.status === "cancelled"
  ) return null;

  const basePoints = Math.floor(order.total / 10);
  if (basePoints <= 0) return null;

  const userDoc = await User.findById(userId).select("lifetimePoints");
  if (!userDoc) return null;

  const isGold = (userDoc.lifetimePoints ?? 0) >= GOLD_TIER_MIN_POINTS;
  const calculatedEarned = basePoints * (isGold ? GOLD_POINTS_MULTIPLIER : 1);
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, loyaltyPointsEarned: 0, status: { $ne: "cancelled" } },
    {
      $set: {
        loyaltyPointsEarned: calculatedEarned,
        loyaltyCreditLedgerVersion: 1,
      },
    },
    { new: true }
  );
  let earned = calculatedEarned;
  if (!claimed) {
    const persisted = await Order.findById(order._id)
      .select("status loyaltyPointsEarned loyaltyCreditLedgerVersion loyaltyCreditAppliedAt");
    if (!persisted || persisted.status === "cancelled" || !(persisted.loyaltyPointsEarned > 0)) {
      return null;
    }
    earned = persisted.loyaltyPointsEarned;

    // Orders credited before the durable User ledger existed are treated as
    // already applied, then backfilled without changing the balance.
    if ((persisted.loyaltyCreditLedgerVersion || 0) < 1) {
      const legacyUser = await User.findByIdAndUpdate(
        userId,
        { $addToSet: { loyaltyCreditedOrderIds: order._id } },
        { new: true }
      ).select("name email phone points lifetimePoints");
      if (!legacyUser) return null;
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            loyaltyCreditLedgerVersion: 1,
            loyaltyCreditAppliedAt: persisted.loyaltyCreditAppliedAt || new Date(),
          },
        }
      );
      return {
        earned,
        balance: legacyUser.points,
        lifetimePoints: legacyUser.lifetimePoints,
        customer: legacyUser.name,
        alreadyCredited: true,
      };
    }
  }

  try {
    let updatedUser = await User.findOneAndUpdate(
      {
        _id: userId,
        loyaltyCreditedOrderIds: { $ne: order._id },
        cancelledPosCreditsReversed: { $ne: order._id },
      },
      {
        $inc: { points: earned, lifetimePoints: earned },
        $set: { pointsLastEarnedAt: new Date() },
        $addToSet: { loyaltyCreditedOrderIds: order._id },
      },
      { new: true }
    ).select("name email phone points lifetimePoints");

    if (!updatedUser) {
      const currentUser = await User.findById(userId)
        .select("name email phone points lifetimePoints +loyaltyCreditedOrderIds +cancelledPosCreditsReversed");
      if (!currentUser) throw new Error("Rewards account not found while crediting points");
      if (currentUser.cancelledPosCreditsReversed?.some((id) => String(id) === String(order._id))) {
        return null;
      }
      if (!currentUser.loyaltyCreditedOrderIds?.some((id) => String(id) === String(order._id))) {
        throw new Error("Rewards credit could not be reconciled");
      }
      updatedUser = currentUser;
    }

    await Order.updateOne(
      { _id: order._id, loyaltyCreditAppliedAt: null },
      { $set: { loyaltyCreditAppliedAt: new Date() } }
    );

    return {
      earned,
      balance: updatedUser.points,
      lifetimePoints: updatedUser.lifetimePoints,
      customer: updatedUser.name,
      alreadyCredited: !claimed,
    };
  } catch (error) {
    // Do not roll back the order claim: the User update may have succeeded
    // despite an ambiguous driver error. The per-user ledger makes retry safe.
    console.error("awardLoyaltyPoints error:", error.message);
    return null;
  }
}

export async function reconcileRecentLoyaltyPoints(userId, days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // A completed restaurant order represents a delivered purchase. Normalize
  // older records that reached completed without staff pressing "Cobrado".
  await Order.updateMany(
    {
      user: userId,
      status: "completed",
      paymentStatus: "pending",
      loyaltyPointsEarned: 0,
      createdAt: { $gte: cutoff },
    },
    { $set: { paymentStatus: "paid" } }
  );

  const pendingOrders = await Order.find({
    user: userId,
    status: { $ne: "cancelled" },
    paymentStatus: "paid",
    $or: [
      { loyaltyPointsEarned: 0 },
      {
        loyaltyPointsEarned: { $gt: 0 },
        loyaltyCreditLedgerVersion: { $gte: 1 },
        loyaltyCreditAppliedAt: null,
      },
    ],
    total: { $gt: 0 },
    createdAt: { $gte: cutoff },
  }).sort({ createdAt: 1 }).limit(50);

  let earned = 0;
  let recoveredOrders = 0;
  for (const order of pendingOrders) {
    const result = await awardLoyaltyPoints(order);
    if (result?.earned) {
      earned += result.earned;
      recoveredOrders += 1;
    }
  }

  return { earned, recoveredOrders };
}
