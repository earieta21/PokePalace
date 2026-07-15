import express from "express";
import { rateLimit } from "../middleware/rateLimit.js";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { reportClientError, getErrors } from "../controllers/monitorController.js";

const router = express.Router();

// Endpoint público: sin este límite cualquiera podría inundar la base.
const reportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: "Demasiados reportes.",
});

const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.post("/error",  reportLimiter, reportClientError);
router.get ("/errors", seniorStaff, getErrors);

export default router;
