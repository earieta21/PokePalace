import crypto from "crypto";
import User from "../models/User.js";
import Redemption from "../models/Redemption.js";

// Source of truth for reward costs/names — mirrors src/pages/Promotions.jsx.
// Never trust a cost or name submitted by the client.
export const REWARDS_CATALOG = {
  1: { name: "Bebida gratis", cost: 50 },
  2: { name: "Topping extra", cost: 75 },
  4: { name: "Proteína doble", cost: 200 },
  3: { name: "Bowl gratis", cost: 300 },
};

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
  try {
    const rewardId = Number(req.body.rewardId);
    const reward = REWARDS_CATALOG[rewardId];
    if (!reward) return res.status(400).json({ msg: "Premio inválido" });

    // Atomic check-and-deduct — same pattern as points redemption at checkout,
    // so firing this twice at once can't spend the same points balance twice.
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.userId, points: { $gte: reward.cost } },
      { $inc: { points: -reward.cost } },
      { new: true }
    );
    if (!updatedUser) return res.status(400).json({ msg: "No tienes suficientes puntos" });

    let redemption = null;
    for (let attempt = 0; attempt < 5 && !redemption; attempt++) {
      try {
        redemption = await Redemption.create({
          user: req.userId,
          rewardId,
          rewardName: reward.name,
          pointsCost: reward.cost,
          code: generateCode(),
        });
      } catch (err) {
        if (err.code !== 11000) throw err; // retry only on code collision
      }
    }
    if (!redemption) {
      // Extremely unlikely, but refund the points rather than lose them
      await User.findByIdAndUpdate(req.userId, { $inc: { points: reward.cost } });
      return res.status(500).json({ msg: "No se pudo generar el código, intenta de nuevo" });
    }

    res.status(201).json({ redemption, points: updatedUser.points });
  } catch {
    res.status(500).json({ msg: "Error canjeando el premio" });
  }
};

export const getMyRedemptions = async (req, res) => {
  try {
    const redemptions = await Redemption.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json({ redemptions });
  } catch {
    res.status(500).json({ msg: "Error obteniendo tus premios" });
  }
};
