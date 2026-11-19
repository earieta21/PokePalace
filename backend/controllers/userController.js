import User from "../models/User.js";
import { sanitizeCustomerBowl } from "../utils/customerOrder.js";
import { recordRewardVisit } from "../utils/rewardConversion.js";
import { expireStalePoints } from "../utils/loyalty.js";

/* GET /api/users/me — returns fresh user profile (including updated points) */
export const getMe = async (req, res) => {
  try {
    const rewardVisit = req.query?.rewardVisit === "1";
    if (rewardVisit) await expireStalePoints(req.userId);
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ msg: "Usuario no encontrado" });
    if (rewardVisit) {
      await recordRewardVisit(req.userId, user.points);
      res.set("Cache-Control", "no-store");
    }
    res.json({ user });
  } catch {
    res.status(500).json({ msg: "Error obteniendo perfil" });
  }
};

export const getFavorites = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("favoriteBowls");
    if (!user) return res.status(404).json({ msg: "Usuario no encontrado" });
    res.json({ favorites: user.favoriteBowls });
  } catch {
    res.status(500).json({ msg: "Error obteniendo favoritos" });
  }
};

export const saveFavorite = async (req, res) => {
  try {
    const { name } = req.body;
    if (typeof name !== "string" || !name.trim()) return res.status(400).json({ msg: "El nombre del favorito es requerido" });

    let bowl;
    try {
      bowl = sanitizeCustomerBowl(req.body);
    } catch (err) {
      return res.status(400).json({ msg: err.message || "El bowl no es válido" });
    }

    const user = await User.findOneAndUpdate(
      { _id: req.userId, "favoriteBowls.9": { $exists: false } },
      { $push: { favoriteBowls: { name: name.trim(), ...bowl } } },
      { new: true, runValidators: true, projection: { favoriteBowls: 1 } }
    );
    if (!user) {
      if (!await User.exists({ _id: req.userId })) return res.status(404).json({ msg: "Usuario no encontrado" });
      return res.status(400).json({ code: "favorite_limit", msg: "Máximo 10 bowls favoritos permitidos" });
    }
    res.status(201).json({ favorites: user.favoriteBowls });
  } catch {
    res.status(500).json({ msg: "Error guardando favorito" });
  }
};

export const deleteFavorite = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ msg: "Usuario no encontrado" });

    const before = user.favoriteBowls.length;
    user.favoriteBowls = user.favoriteBowls.filter(
      (f) => f._id.toString() !== req.params.favoriteId
    );

    if (user.favoriteBowls.length === before) {
      return res.status(404).json({ msg: "Favorito no encontrado" });
    }

    await user.save();
    res.json({ favorites: user.favoriteBowls });
  } catch {
    res.status(500).json({ msg: "Error eliminando favorito" });
  }
};
