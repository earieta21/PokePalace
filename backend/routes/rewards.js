import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { claimSocialStoryReward, redeemReward, getMyRedemptions } from "../controllers/rewardsController.js";

const router = express.Router();

// Generous for a real customer, tight enough to blunt a scripted points-drain attempt
const redeemLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  message: "Demasiados intentos de canje. Espera unos minutos e intenta de nuevo.",
});

router.post("/redeem", protect, redeemLimiter, redeemReward);
router.post("/claim", protect, redeemLimiter, claimSocialStoryReward);
router.get("/mine", protect, getMyRedemptions);

export default router;

