import BowlCosting from "../models/BowlCosting.js";
import StoreSettings from "../models/StoreSettings.js";
import { isPromo2x1Day } from "../utils/promoSchedule.js";

export const getAvailability = async (req, res) => {
  try {
    const [doc, costing] = await Promise.all([
      StoreSettings.findOne({ key: "main" }),
      // Los ingredientes que el negocio no maneja se apagan una sola vez en
      // Costeo; aquí se exponen para que el armador ni los ofrezca. Es
      // distinto de `unavailableItems`, que es lo agotado del día.
      BowlCosting.findById("bowl-costing").select("disabledProteins disabledComplements"),
    ]);
    res.json({
      unavailableItems: doc?.unavailableItems ?? [],
      hiddenIngredients: [
        ...(costing?.disabledProteins ?? []),
        ...(costing?.disabledComplements ?? []),
      ],
      // La promo 2x1 solo corre martes/jueves — el frontend usa esto para
      // mostrar/ocultar la sección sin que cada pantalla calcule el día.
      promo2x1Active: isPromo2x1Day(),
    });
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
