import User from "../models/User.js";
import { sanitizeCustomerBowl } from "../utils/customerOrder.js";

/* GET /api/users/me — returns fresh user profile (including updated points) */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ msg: "Usuario no encontrado" });
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
    const { name, base, bases, protein, proteins, complements, sauces, toppings, extraScoopProteins } = req.body;
    if (!name?.trim()) return res.status(400).json({ msg: "El nombre del favorito es requerido" });

    let bowl;
    try {
      bowl = sanitizeCustomerBowl({ base, bases, protein, proteins, complements, sauces, toppings, extraScoopProteins });
    } catch (err) {
      return res.status(400).json({ msg: err.message || "El bowl no es válido" });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ msg: "Usuario no encontrado" });

    if (user.favoriteBowls.length >= 10) {
      return res.status(400).json({ msg: "Máximo 10 bowls favoritos permitidos" });
    }

    user.favoriteBowls.push({
      name: name.trim(),
      base: bowl.base,
      bases: bowl.bases,
      proteins: bowl.proteins,
      bowlSize: bowl.bowlSize,
      marinades: [],
      complements: bowl.complements,
      sauces: bowl.sauces,
      toppings: bowl.toppings,
      extraScoopProteins: bowl.extraScoopProteins,
    });

    await user.save();
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
