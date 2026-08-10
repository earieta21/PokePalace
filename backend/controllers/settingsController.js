import StoreSettings from "../models/StoreSettings.js";
import { startOfDateKey } from "../utils/timeZone.js";

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

// Excepciones puntuales a "cerrado los miércoles" -- ver isRestaurantClosedDay
// en backend/utils/customerOrder.js, que es quien realmente aplica esto.
export const getDayOverrides = async (req, res) => {
  try {
    const doc = await StoreSettings.findOne({ key: "main" });
    res.json({
      openDayOverrides: doc?.openDayOverrides ?? [],
      closedDayOverrides: doc?.closedDayOverrides ?? [],
    });
  } catch {
    res.status(500).json({ msg: "Error al obtener las excepciones de horario" });
  }
};

const cleanDateList = (value) => {
  if (!Array.isArray(value)) return { error: "Debe ser una lista de fechas" };
  const dates = [...new Set(value.map((d) => String(d || "").trim()))];
  if (dates.some((d) => !startOfDateKey(d))) return { error: "Una de las fechas no es válida (usa AAAA-MM-DD)" };
  return { dates };
};

export const setDayOverrides = async (req, res) => {
  try {
    const openResult = cleanDateList(req.body.openDayOverrides ?? []);
    if (openResult.error) return res.status(400).json({ msg: openResult.error });
    const closedResult = cleanDateList(req.body.closedDayOverrides ?? []);
    if (closedResult.error) return res.status(400).json({ msg: closedResult.error });

    const overlap = openResult.dates.filter((d) => closedResult.dates.includes(d));
    if (overlap.length > 0) {
      return res.status(400).json({ msg: `${overlap[0]} no puede estar abierta y cerrada a la vez` });
    }

    const doc = await StoreSettings.findOneAndUpdate(
      { key: "main" },
      { openDayOverrides: openResult.dates, closedDayOverrides: closedResult.dates },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ openDayOverrides: doc.openDayOverrides, closedDayOverrides: doc.closedDayOverrides });
  } catch {
    res.status(500).json({ msg: "Error al actualizar las excepciones de horario" });
  }
};
