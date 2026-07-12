import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { lookupRedemption, useRedemption } from "../controllers/staffRewardsController.js";

const router = express.Router();

const anyStaff = requireStaffAuth([]);

router.get  ("/:code",      anyStaff, lookupRedemption);
router.patch("/:code/use",  anyStaff, useRedemption);

export default router;
