import express from "express";
import { getRegisteredCustomers, getCustomerDetail } from "../controllers/staffCustomersController.js";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";

const router = express.Router();
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.get("/", seniorStaff, getRegisteredCustomers);
router.get("/:id", seniorStaff, getCustomerDetail);

export default router;
