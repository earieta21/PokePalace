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
  if (!userId || !order.total || order.total <= 0 || order.paymentStatus !== "paid") return null;

  const basePoints = Math.floor(order.total / 10);
  if (basePoints <= 0) return null;

  const userDoc = await User.findById(userId).select("lifetimePoints");
  if (!userDoc) return null;

  const isGold = (userDoc.lifetimePoints ?? 0) >= GOLD_TIER_MIN_POINTS;
  const earned = basePoints * (isGold ? GOLD_POINTS_MULTIPLIER : 1);
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, loyaltyPointsEarned: 0 },
    { $set: { loyaltyPointsEarned: earned } },
    { new: true }
  );
  if (!claimed) return null;

  try {
    const updatedUser = await User.findByIdAndUpdate(userId, {
      $inc: { points: earned, lifetimePoints: earned },
      $set: { pointsLastEarnedAt: new Date() },
    }, { new: true }).select("name email phone points lifetimePoints");

    if (!updatedUser) throw new Error("Rewards account not found while crediting points");

    return {
      earned,
      balance: updatedUser.points,
      lifetimePoints: updatedUser.lifetimePoints,
      customer: updatedUser.name,
    };
  } catch (error) {
    try {
      await Order.updateOne(
        { _id: order._id, loyaltyPointsEarned: earned },
        { $set: { loyaltyPointsEarned: 0 } }
      );
    } catch (rollbackError) {
      console.error("CRITICAL: loyalty rollback failed", rollbackError.message);
    }
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
    loyaltyPointsEarned: 0,
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
