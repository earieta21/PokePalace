import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { createSocialStoryReward, lookupRedemption, redeemMemberReward } from "../controllers/staffRewardsController.js";

const router = express.Router();

const campaignStaff = requireStaffAuth(["cashier", "manager", "admin", "owner"]);
// El POS también consulta un código de premio al armar una venta -- los
// empleados ya pueden vender en el POS, así que necesitan poder buscarlo.
const rewardLookupStaff = requireStaffAuth(["employee", "cashier", "manager", "admin", "owner"]);

router.post ("/social-story", campaignStaff, createSocialStoryReward);
router.post ("/member-redeem", rewardLookupStaff, redeemMemberReward);
router.get  ("/:code",        rewardLookupStaff, lookupRedemption);

export default router;
