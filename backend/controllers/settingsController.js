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

// Público — el frontend de clientes lo consulta para saber si puede ordenar
export const getStoreStatus = async (req, res) => {
  try {
    const doc = await StoreSettings.findOne({ key: "main" });
    res.json({
      ordersPaused: doc?.ordersPaused ?? false,
      pausedMessage: doc?.pausedMessage || "",
    });
  } catch {
    res.status(500).json({ msg: "Error al obtener el estado de la tienda" });
  }
};

export const setStoreStatus = async (req, res) => {
  try {
    const { ordersPaused, pausedMessage } = req.body;
    const doc = await StoreSettings.findOneAndUpdate(
      { key: "main" },
      {
        ordersPaused: Boolean(ordersPaused),
        pausedMessage: typeof pausedMessage === "string" ? pausedMessage.trim().slice(0, 200) : "",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ordersPaused: doc.ordersPaused, pausedMessage: doc.pausedMessage });
  } catch {
    res.status(500).json({ msg: "Error al actualizar el estado de la tienda" });
  }
};
