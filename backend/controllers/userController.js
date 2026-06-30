import User from "../models/User.js";

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
    const { name, base, proteins, bowlSize, marinades, complements, sauces, toppings } = req.body;
    if (!name?.trim()) return res.status(400).json({ msg: "El nombre del favorito es requerido" });
    if (!base || !Array.isArray(proteins) || proteins.length < 2) {
      return res.status(400).json({ msg: "El bowl debe tener base y al menos 2 proteínas" });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ msg: "Usuario no encontrado" });

    if (user.favoriteBowls.length >= 10) {
      return res.status(400).json({ msg: "Máximo 10 bowls favoritos permitidos" });
    }

    user.favoriteBowls.push({
      name: name.trim(),
      base,
      proteins,
      bowlSize: bowlSize || (proteins.length === 3 ? "large" : "normal"),
      marinades: marinades || [],
      complements: complements || [],
      sauces: sauces || [],
      toppings: toppings || [],
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
