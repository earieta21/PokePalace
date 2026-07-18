import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { createSocialStoryReward, lookupRedemption } from "../controllers/staffRewardsController.js";

const router = express.Router();

const campaignStaff = requireStaffAuth(["cashier", "manager", "admin", "owner"]);

router.post ("/social-story", campaignStaff, createSocialStoryReward);
router.get  ("/:code",        campaignStaff, lookupRedemption);

export default router;
