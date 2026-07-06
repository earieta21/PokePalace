import StoreSettings from "../models/StoreSettings.js";

export const getAvailability = async (req, res) => {
  try {
    const doc = await StoreSettings.findOne({ key: "main" });
    res.json({ unavailableItems: doc?.unavailableItems ?? [] });
  } catch {
    res.status(500).json({ msg: "Error al obtener disponibilidad" });
  }
};

export const setAvailability = async (req, res) => {
  try {
    const { unavailableItems } = req.body;
    const doc = await StoreSettings.findOneAndUpdate(
      { key: "main" },
      { unavailableItems: Array.isArray(unavailableItems) ? unavailableItems : [] },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ unavailableItems: doc.unavailableItems });
  } catch {
    res.status(500).json({ msg: "Error al actualizar disponibilidad" });
  }
};
