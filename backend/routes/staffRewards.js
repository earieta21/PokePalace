import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { lookupRedemption } from "../controllers/staffRewardsController.js";

const router = express.Router();

const anyStaff = requireStaffAuth([]);

router.get  ("/:code",      anyStaff, lookupRedemption);

export default router;
