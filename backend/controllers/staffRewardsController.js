import Redemption from "../models/Redemption.js";
import SocialStoryParticipant from "../models/SocialStoryParticipant.js";
import { STORY_REWARD } from "../config/rewardsCatalog.js";
import { redeemReward } from "./rewardsController.js";
import { verifyMemberQr } from "../utils/memberQr.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const STORY_CODE_EXPIRY_DAYS = 7;
const STORY_COOLDOWN_DAYS = 30;

function generateCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return code;
}

function normalizeHandle(value) {
  return String(value || "").trim().replace(/^@+/, "").toLowerCase();
}

// Marca como "expired" (lazy) un redemption activo cuya fecha ya pasó.
// Devuelve el documento ya actualizado si aplicó el cambio.
async function markExpiredIfNeeded(redemption) {
  if (redemption && redemption.status === "active" && redemption.expiresAt && redemption.expiresAt <= new Date()) {
    redemption.status = "expired";
    await redemption.save();
  }
  return redemption;
}

export const lookupRedemption = async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    let redemption = await Redemption.findOne({ code }).populate("user", "name email");
    if (!redemption) return res.status(404).json({ msg: "Código no encontrado" });
    redemption = await markExpiredIfNeeded(redemption);
    res.json({ redemption });
  } catch {
    res.status(500).json({ msg: "Error buscando el código" });
  }
};

/* The QR proves that the customer intentionally presented this account at the
   register. Its jti also makes one QR good for at most one loyalty redemption;
   retries with the same reward remain idempotent. */
export const redeemMemberReward = async (req, res) => {
  try {
    const memberToken = verifyMemberQr(req.body?.payload);
    req.userId = memberToken.id;
    req.body = {
      ...(req.body || {}),
      clientRedemptionId: `member-qr:${memberToken.jti}`,
    };
    return redeemReward(req, res);
  } catch (err) {
    return res.status(err.status || 500).json({
      msg: err.status ? err.message : "No se pudo canjear el premio con este QR",
    });
  }
};

export const createSocialStoryReward = async (req, res) => {
  const now = new Date();
  try {
    const platform = String(req.body.platform || "").toLowerCase();
    const displayHandle = String(req.body.handle || "").trim();
    const handleNormalized = normalizeHandle(displayHandle);
    const confirmedTagged = req.body.confirmedTagged === true;
    const confirmedDisclosure = req.body.confirmedDisclosure === true;

    if (!["instagram", "facebook"].includes(platform)) {
      return res.status(400).json({ msg: "Selecciona Instagram o Facebook" });
    }
    if (!/^[a-z0-9._-]{2,50}$/.test(handleNormalized)) {
      return res.status(400).json({ msg: "Ingresa el usuario de la cuenta social" });
    }
    if (!confirmedTagged || !confirmedDisclosure) {
      return res.status(400).json({ msg: "Confirma la etiqueta y el aviso de promoción" });
    }

    let participant;
    let recovered = false;
    try {
      participant = await SocialStoryParticipant.findOneAndUpdate(
        {
          platform,
          handleNormalized,
          $or: [
            { nextEligibleAt: { $lte: now } },
            { nextEligibleAt: { $exists: false } },
          ],
        },
        {
          $set: {
            displayHandle: `@${handleNormalized}`,
            lastClaimAt: now,
            nextEligibleAt: new Date(now.getTime() + STORY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000),
            lastVerifiedBy: req.staff.id,
            lastRedemptionId: new mongoose.Types.ObjectId(),
          },
          $setOnInsert: { platform, handleNormalized },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
      participant = await SocialStoryParticipant.findOne({ platform, handleNormalized });
      recovered = true;
    }
    if (!participant) throw new Error("No se pudo recuperar la reserva del premio");

    const { nextEligibleAt } = participant;
    const expiresAt = new Date(new Date(participant.lastClaimAt).getTime() + STORY_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    let redemption = participant.lastRedemptionId
      ? await Redemption.findById(participant.lastRedemptionId)
      : await Redemption.findOne({ source: "social_story", socialPlatform: platform, socialHandle: `@${handleNormalized}`, verifiedAt: participant.lastClaimAt });
    if (!redemption && (!participant.lastRedemptionId || expiresAt <= now)) {
      return res.status(409).json({ msg: "Esta cuenta ya participó y no tiene un premio vigente para recuperar.", nextEligibleAt });
    }
    // The reserved _id makes simultaneous retries converge on one document.
    // Keep the reservation on failure: a later retry completes it, preserving
    // the original expiry and cooldown instead of starting a new campaign.
    for (let attempt = 0; attempt < 5 && !redemption; attempt++) {
      try {
        redemption = await Redemption.create({
          _id: participant.lastRedemptionId,
          rewardId: STORY_REWARD.id,
          rewardName: STORY_REWARD.name.es,
          pointsCost: 0,
          code: generateCode(),
          expiresAt,
          source: "social_story",
          socialPlatform: platform,
          socialHandle: `@${handleNormalized}`,
          verifiedBy: participant.lastVerifiedBy,
          verifiedAt: participant.lastClaimAt,
        });
      } catch (err) {
        redemption = await Redemption.findById(participant.lastRedemptionId);
        if (!redemption && err.code !== 11000) throw err;
        if (redemption) recovered = true;
      }
    }
    if (!redemption) throw new Error("No se pudo generar un código único");
    redemption = await markExpiredIfNeeded(redemption);
    if (redemption.status !== "active") {
      const reason = { used: "ya fue utilizado", expired: "ya venció", cancelled: "fue cancelado" }[redemption.status] || "no está disponible";
      return res.status(409).json({ msg: `El premio de esta cuenta ${reason}. No se generó otro código.`, nextEligibleAt });
    }
    // A recovered link never outlives the original reward. Already-linked
    // rewards only need their existing code, not another account-claim link.
    const claimExpiresInSeconds = Math.floor((new Date(redemption.expiresAt).getTime() - Date.now()) / 1000);
    if (claimExpiresInSeconds <= 0) return res.status(409).json({ msg: "El premio acaba de vencer.", nextEligibleAt });
    const claimToken = redemption.user ? null : jwt.sign(
      {
        purpose: "reward_claim",
        redemptionId: redemption._id.toString(),
      },
      process.env.JWT_SECRET,
      { expiresIn: claimExpiresInSeconds }
    );

    res.status(recovered ? 200 : 201).json({ redemption, nextEligibleAt, claimToken, recovered });
  } catch (err) {
    console.error("createSocialStoryReward error:", err.message);
    res.status(503).json({ msg: "No se pudo terminar la entrega. Reintenta con la misma cuenta para recuperar el premio.", retryable: true });
  }
};

export const useRedemption = async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();

    // Atomic: only succeeds if it's still "active" and not past its expiry,
    // so the same code can't be marked used twice by two staff members
    // scanning it at once, and an expired code can't slip through either.
    const redemption = await Redemption.findOneAndUpdate(
      {
        code,
        status: "active",
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      },
      { status: "used", usedAt: new Date(), usedBy: req.staff.id },
      { new: true }
    ).populate("user", "name email");

    if (!redemption) {
      let existing = await Redemption.findOne({ code });
      if (!existing) return res.status(404).json({ msg: "Código no encontrado" });

      existing = await markExpiredIfNeeded(existing);
      if (existing.status === "expired") {
        return res.status(400).json({ msg: "Este código ya venció" });
      }
      if (existing.status === "used") {
        return res.status(400).json({ msg: `Este código ya fue usado el ${existing.usedAt?.toLocaleString("es-MX") || ""}` });
      }
      return res.status(400).json({ msg: "Este código ya no está disponible" });
    }

    res.json({ redemption });
  } catch {
    res.status(500).json({ msg: "Error canjeando el código" });
  }
};

