import crypto from "crypto";
import User from "../models/User.js";
import Redemption from "../models/Redemption.js";
import { expireStalePoints, REDEMPTION_CODE_EXPIRY_DAYS } from "../utils/loyalty.js";
import { getRewardById } from "../../shared/rewardsCatalog.js";

// Unambiguous charset — no 0/O, 1/I/L — easier for staff to read back a code.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return code;
}

export const redeemReward = async (req, res) => {
  let deductedReward = null;
  try {
    const rewardId = Number(req.body.rewardId);
    const reward = getRewardById(rewardId);
    if (!reward) return res.status(400).json({ msg: "Premio inválido" });

    // Saldo inactivo (12+ meses sin ganar puntos) se resetea antes de dejar gastarlo
    await expireStalePoints(req.userId);

    // Atomic check-and-deduct — same pattern as points redemption at checkout,
    // so firing this twice at once can't spend the same points balance twice.
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.userId, points: { $gte: reward.cost } },
      { $inc: { points: -reward.cost } },
      { new: true }
    );
    if (!updatedUser) return res.status(400).json({ msg: "No tienes suficientes puntos" });
    deductedReward = reward;

    const expiresAt = new Date(Date.now() + REDEMPTION_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    let redemption = null;
    for (let attempt = 0; attempt < 5 && !redemption; attempt++) {
      try {
        redemption = await Redemption.create({
          user: req.userId,
          rewardId,
          rewardName: reward.name.es,
          pointsCost: reward.cost,
          code: generateCode(),
          expiresAt,
        });
      } catch (err) {
        if (err.code !== 11000) throw err; // retry only on code collision
      }
    }
    if (!redemption) {
      // Extremely unlikely, but refund the points rather than lose them
      await User.findByIdAndUpdate(req.userId, { $inc: { points: reward.cost } });
      deductedReward = null;
      return res.status(500).json({ msg: "No se pudo generar el código, intenta de nuevo" });
    }

    deductedReward = null;
    res.status(201).json({ redemption, points: updatedUser.points });
  } catch (err) {
    // Once points have been deducted, every failure before a redemption is
    // returned must compensate the balance. This avoids charging a customer
    // for a database/validation failure while generating the code.
    if (deductedReward) {
      try {
        await User.findByIdAndUpdate(req.userId, { $inc: { points: deductedReward.cost } });
      } catch (refundError) {
        console.error("CRITICAL: reward points refund failed", {
          userId: req.userId,
          rewardId: deductedReward.id,
          error: refundError.message,
        });
      }
    }
    console.error("redeemReward error:", err.message);
    res.status(500).json({ msg: "Error canjeando el premio" });
  }
};

export const getMyRedemptions = async (req, res) => {
  try {
    // Marca como vencidos (lazy) los códigos activos cuya fecha ya pasó
    await Redemption.updateMany(
      { user: req.userId, status: "active", expiresAt: { $lt: new Date() } },
      { $set: { status: "expired" } }
    );

    const redemptions = await Redemption.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json({ redemptions });
  } catch {
    res.status(500).json({ msg: "Error obteniendo tus premios" });
  }
};
