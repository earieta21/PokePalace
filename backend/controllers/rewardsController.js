import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Redemption from "../models/Redemption.js";
import { expireStalePoints, reconcileRecentLoyaltyPoints, REDEMPTION_CODE_EXPIRY_DAYS } from "../utils/loyalty.js";
import { getRewardById } from "../config/rewardsCatalog.js";

// Unambiguous charset — no 0/O, 1/I/L — easier for staff to read back a code.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CLIENT_REDEMPTION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;
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
    const clientRedemptionId = String(req.body.clientRedemptionId || "").trim();
    if (!Number.isInteger(rewardId) || !CLIENT_REDEMPTION_ID_RE.test(clientRedemptionId)) {
      return res.status(400).json({ msg: "Solicitud de canje inválida" });
    }

    const sendExisting = async (redemption, status = 200) => {
      if (redemption.rewardId !== rewardId) {
        return res.status(409).json({ msg: "Este identificador de canje ya fue utilizado" });
      }
      const user = await User.findById(req.userId).select("points");
      return res.status(status).json({
        redemption,
        points: user?.points ?? 0,
        idempotent: status === 200,
      });
    };

    const existing = await Redemption.findOne({ user: req.userId, clientRedemptionId });
    if (existing) return sendExisting(existing);

    const findReservation = (user) => user?.rewardRedemptionLedger?.find(
      (entry) => entry.clientRedemptionId === clientRedemptionId
    );

    // A durable snapshot lets a retry finish even after a reload or a future
    // catalog change. Existing reservations never deduct the balance again.
    let ledgerUser = await User.findById(req.userId).select("points +rewardRedemptionLedger");
    let reservation = findReservation(ledgerUser);

    if (reservation && reservation.rewardId !== rewardId) {
      return res.status(409).json({ msg: "Este identificador de canje ya fue utilizado" });
    }

    if (!reservation) {
      const reward = getRewardById(rewardId);
      // Social-story rewards are issued only by the verified staff/claim flow;
      // they are not zero-cost loyalty rewards available through this route.
      if (!reward || reward.source === "social_story") {
        return res.status(400).json({ msg: "Premio inválido" });
      }

      // Saldo inactivo (12+ meses sin ganar puntos) se resetea antes de dejar gastarlo.
      await expireStalePoints(req.userId);

      const requestedReservation = {
        clientRedemptionId,
        rewardId,
        rewardName: reward.name.es,
        pointsCost: reward.cost,
        expiresAt: new Date(Date.now() + REDEMPTION_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      try {
        ledgerUser = await User.findOneAndUpdate(
          {
            _id: req.userId,
            points: { $gte: reward.cost },
            "rewardRedemptionLedger.clientRedemptionId": { $ne: clientRedemptionId },
          },
          {
            $inc: { points: -reward.cost },
            $push: { rewardRedemptionLedger: requestedReservation },
          },
          { new: true }
        ).select("points +rewardRedemptionLedger");
      } catch (error) {
        // Mongo may commit an update even if its acknowledgement is lost. Read
        // the atomic marker before deciding whether this request must be retried.
        ledgerUser = await User.findOne({
          _id: req.userId,
          "rewardRedemptionLedger.clientRedemptionId": clientRedemptionId,
        }).select("points +rewardRedemptionLedger");
        if (!ledgerUser) throw error;
      }

      if (!ledgerUser) {
        ledgerUser = await User.findById(req.userId).select("points +rewardRedemptionLedger");
        reservation = findReservation(ledgerUser);
        if (!reservation) {
          return res.status(400).json({ msg: "No tienes suficientes puntos" });
        }
      } else {
        reservation = findReservation(ledgerUser);
      }

      if (!reservation || reservation.rewardId !== rewardId) {
        return res.status(409).json({ msg: "Este identificador de canje ya fue utilizado" });
      }
    }

    let redemption = null;
    let createdRedemption = false;
    for (let attempt = 0; attempt < 5 && !redemption; attempt++) {
      try {
        redemption = await Redemption.create({
          user: req.userId,
          clientRedemptionId,
          rewardId: reservation.rewardId,
          rewardName: reservation.rewardName,
          pointsCost: reservation.pointsCost,
          code: generateCode(),
          expiresAt: reservation.expiresAt,
        });
        createdRedemption = true;
      } catch (err) {
        // A duplicate can be either the random display code or this same
        // client request racing/retrying. Recover the latter as success.
        const recovered = await Redemption.findOne({ user: req.userId, clientRedemptionId });
        if (recovered) {
          redemption = recovered;
          break;
        }
        if (err.code !== 11000) throw err; // retry only on display-code collision
      }
    }
    if (!redemption) {
      return res.status(503).json({
        msg: "No se pudo terminar el canje. Intenta de nuevo; tus puntos no se cobrarán dos veces.",
        retryable: true,
      });
    }

    // This marker is informational. The permanent request entry is retained so
    // a later retry can always prove that the points were already deducted.
    User.updateOne(
      {
        _id: req.userId,
        "rewardRedemptionLedger.clientRedemptionId": clientRedemptionId,
      },
      { $set: { "rewardRedemptionLedger.$.completedAt": new Date() } }
    ).catch((error) => console.error("reward ledger completion marker failed:", error.message));

    return sendExisting(redemption, createdRedemption ? 201 : 200);
  } catch (err) {
    console.error("redeemReward error:", err.message);
    res.status(503).json({
      msg: "No se pudo terminar el canje. Intenta de nuevo con el mismo botón.",
      retryable: true,
    });
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

export const reconcileMyLoyaltyPoints = async (req, res) => {
  try {
    const result = await reconcileRecentLoyaltyPoints(req.userId, 30);
    const user = await User.findById(req.userId).select("points lifetimePoints");
    return res.json({ ...result, points: user?.points ?? 0, lifetimePoints: user?.lifetimePoints ?? 0 });
  } catch (err) {
    console.error("reconcileMyLoyaltyPoints error:", err.message);
    return res.status(500).json({ msg: "No se pudieron revisar tus puntos" });
  }
};

export const claimSocialStoryReward = async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    if (!token || token.length > 2048) {
      return res.status(400).json({ msg: "Enlace de premio inválido" });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ msg: "Este enlace ya no es válido" });
    }

    if (payload.purpose !== "reward_claim" || !payload.redemptionId) {
      return res.status(400).json({ msg: "Enlace de premio inválido" });
    }

    const existing = await Redemption.findById(payload.redemptionId);
    if (!existing || existing.source !== "social_story") {
      return res.status(404).json({ msg: "Premio no encontrado" });
    }

    if (existing.user?.toString() === req.userId) {
      return res.json({ redemption: existing, alreadyClaimed: true });
    }
    if (existing.user) {
      return res.status(409).json({ msg: "Este premio ya fue guardado en otra cuenta" });
    }
    if (existing.status !== "active" || (existing.expiresAt && existing.expiresAt <= new Date())) {
      if (existing.status === "active") {
        existing.status = "expired";
        await existing.save();
      }
      return res.status(400).json({ msg: "Este premio ya no está activo" });
    }

    const redemption = await Redemption.findOneAndUpdate(
      {
        _id: existing._id,
        user: null,
        status: "active",
        source: "social_story",
        expiresAt: { $gt: new Date() },
      },
      { $set: { user: req.userId } },
      { new: true }
    );

    if (!redemption) {
      const latest = await Redemption.findById(existing._id);
      if (latest?.user?.toString() === req.userId) {
        return res.json({ redemption: latest, alreadyClaimed: true });
      }
      return res.status(409).json({ msg: "Este premio acaba de ser guardado en otra cuenta" });
    }

    return res.json({ redemption, alreadyClaimed: false });
  } catch (err) {
    console.error("claimSocialStoryReward error:", err.message);
    return res.status(500).json({ msg: "No se pudo guardar el premio" });
  }
};

