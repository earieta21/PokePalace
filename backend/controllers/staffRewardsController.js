import Redemption from "../models/Redemption.js";
import SocialStoryParticipant from "../models/SocialStoryParticipant.js";
import { STORY_REWARD } from "../config/rewardsCatalog.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";

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
  if (redemption && redemption.status === "active" && redemption.expiresAt && redemption.expiresAt < new Date()) {
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

export const createSocialStoryReward = async (req, res) => {
  const now = new Date();
  let participantBefore = undefined;
  let participantClaimed = false;
  let platform = "";
  let handleNormalized = "";

  try {
    platform = String(req.body.platform || "").toLowerCase();
    const displayHandle = String(req.body.handle || "").trim();
    handleNormalized = normalizeHandle(displayHandle);
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

    const nextEligibleAt = new Date(now.getTime() + STORY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

    try {
      participantBefore = await SocialStoryParticipant.findOneAndUpdate(
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
            nextEligibleAt,
            lastVerifiedBy: req.staff.id,
          },
          $setOnInsert: { platform, handleNormalized },
        },
        { new: false, upsert: true, setDefaultsOnInsert: true }
      );
      participantClaimed = true;
    } catch (err) {
      if (err.code !== 11000) throw err;
      const existing = await SocialStoryParticipant.findOne({ platform, handleNormalized });
      return res.status(409).json({
        msg: "Esta cuenta ya recibió el premio en los últimos 30 días",
        nextEligibleAt: existing?.nextEligibleAt || null,
      });
    }

    const expiresAt = new Date(now.getTime() + STORY_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    let redemption = null;
    for (let attempt = 0; attempt < 5 && !redemption; attempt++) {
      try {
        redemption = await Redemption.create({
          rewardId: STORY_REWARD.id,
          rewardName: STORY_REWARD.name.es,
          pointsCost: 0,
          code: generateCode(),
          expiresAt,
          source: "social_story",
          socialPlatform: platform,
          socialHandle: `@${handleNormalized}`,
          verifiedBy: req.staff.id,
          verifiedAt: now,
        });
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
    if (!redemption) throw new Error("No se pudo generar un código único");

    // The QR contains a signed, single-purpose token instead of the reward code.
    // It remains valid only while the reward is valid and can attach this
    // social-story reward to a single customer account.
    const claimExpiresInSeconds = Math.max(60, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
    const claimToken = jwt.sign(
      {
        purpose: "reward_claim",
        redemptionId: redemption._id.toString(),
      },
      process.env.JWT_SECRET,
      { expiresIn: claimExpiresInSeconds }
    );

    res.status(201).json({ redemption, nextEligibleAt, claimToken });
  } catch (err) {
    if (participantClaimed) {
      try {
        if (participantBefore) {
          await SocialStoryParticipant.updateOne(
            { platform, handleNormalized, lastClaimAt: now },
            {
              $set: {
                displayHandle: participantBefore.displayHandle,
                lastClaimAt: participantBefore.lastClaimAt,
                nextEligibleAt: participantBefore.nextEligibleAt,
                lastVerifiedBy: participantBefore.lastVerifiedBy,
              },
            }
          );
        } else {
          await SocialStoryParticipant.deleteOne({ platform, handleNormalized, lastClaimAt: now });
        }
      } catch (rollbackError) {
        console.error("Social story cooldown rollback failed:", rollbackError.message);
      }
    }
    console.error("createSocialStoryReward error:", err.message);
    res.status(500).json({ msg: "No se pudo generar el premio de historia" });
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

