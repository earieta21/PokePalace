import express from "express";
import { requireStaffAuth } from "../middleware/requireStaffAuth.js";
import { listRecipeCosts, getRecipe, saveRecipe } from "../controllers/recipeController.js";

const router = express.Router();
// Costos/recetas son datos financieros sensibles -- igual que Finanzas/auditoría.
const seniorStaff = requireStaffAuth(["manager", "admin", "owner"]);

router.get ("/",            seniorStaff, listRecipeCosts);
router.get ("/:catalogId",  seniorStaff, getRecipe);
router.post("/",            seniorStaff, saveRecipe);

export default router;