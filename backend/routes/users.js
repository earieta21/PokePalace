import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getFavorites, saveFavorite, deleteFavorite } from "../controllers/userController.js";

const router = express.Router();

router.get("/me/favorites",                     protect, getFavorites);
router.post("/me/favorites",                    protect, saveFavorite);
router.delete("/me/favorites/:favoriteId",      protect, deleteFavorite);

export default router;
