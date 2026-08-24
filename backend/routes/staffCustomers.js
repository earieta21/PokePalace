import express from "express";
import { getRegisteredCustomers } from "../controllers/staffCustomersController.js";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";

const router = express.Router();
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.get("/", seniorStaff, getRegisteredCustomers);

export default router;
