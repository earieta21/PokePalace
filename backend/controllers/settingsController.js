import BowlCosting from "../models/BowlCosting.js";
import StoreSettings from "../models/StoreSettings.js";
import { isComboPalaceDay, isPromo2x1Day } from "../utils/promoSchedule.js";
import {
  DELIVERY_APP_PLATFORMS,
  PosOrderValidationError,
  getUnavailableCatalogIds,
  sanitizeDeliveryCommissions,
} from "../config/posCatalog.js";
import {
  AVAILABILITY_FIELDS,
  AVAILABILITY_STATUSES,
  applyAvailabilityChange,
  applyLegacyAvailabilityList,
  availabilityLists,
  availabilityUpdate,
  cleanAvailabilityId,
  seasonalUnavailableItems,
} from "../utils/availability.js";

const commissionsResponse = (doc) => Object.fromEntries(
  [...DELIVERY_APP_PLATFORMS].map((platform) => [platform, doc?.deliveryCommissions?.[platform] ?? 0])
);

export const getAvailability = async (req, res) => {
  try {
    const [doc, costing] = await Promise.all([
      StoreSettings.findOne({ key: "main" }).select(AVAILABILITY_FIELDS).lean(),
      // Los ingredientes que el negocio no maneja se apagan una sola vez en
      // Costeo; aquí se exponen para que el armador ni los ofrezca. Es
      // distinto de `unavailableItems`, que es lo agotado del día.
      BowlCosting.findById("bowl-costing").select("disabledProteins disabledComplements"),
    ]);
    const lists = availabilityLists(doc);
    // Lo de temporada tampoco se ofrece en el armador.
    const hiddenIngredients = [...new Set([
      ...(costing?.disabledProteins ?? []),
      ...(costing?.disabledComplements ?? []),
      ...lists.seasonalUnavailableItems,
    ])];
    res.json({
      ...lists,
      // Bowls de la casa, bebidas y extras que quedan fuera por lo agotado.
      unavailableCatalogItems: getUnavailableCatalogIds(lists.unavailableItems),
      hiddenIngredients,
      // Los que llevan algo fuera de temporada (el Skinny sin mango) ni se
      // muestran: "Agotado" sonaría a que regresa pronto.
      hiddenCatalogItems: getUnavailableCatalogIds(hiddenIngredients),
      // La promo 2x1 solo corre martes/jueves y el Combo Palace lunes,
      // miércoles y viernes — el frontend usa esto para mostrar/ocultar cada
      // sección sin que cada pantalla calcule el día por su cuenta.
      promo2x1Active: isPromo2x1Day(),
      comboPalaceActive: isComboPalaceDay(),
    });
  } catch {
    res.status(500).json({ msg: "Error al obtener disponibilidad" });
  }
};

// Cualquier empleado marca lo agotado de hoy; lo de temporada se queda
// apagado indefinidamente, así que solo gerencia lo pone o lo quita.
const SEASON_ROLES = new Set(["manager", "admin", "owner"]);

export const setAvailability = async (req, res) => {
  try {
    const now = new Date();
    const current = await StoreSettings.findOne({ key: "main" }).select(AVAILABILITY_FIELDS).lean();
    let next;
    if (req.body?.id !== undefined || req.body?.status !== undefined) {
      const id = cleanAvailabilityId(req.body.id);
      const { status } = req.body;
      if (!id || !AVAILABILITY_STATUSES.includes(status)) {
        return res.status(400).json({ msg: "Ingrediente o estado no válido" });
      }
      const wasSeason = seasonalUnavailableItems(current).includes(id);
      if ((status === "season" || wasSeason) && !SEASON_ROLES.has(req.staff?.role)) {
        return res.status(403).json({ msg: "Solo gerencia puede cambiar lo que está fuera de temporada" });
      }
      next = applyAvailabilityChange(current, { id, status }, now);
    } else {
      next = applyLegacyAvailabilityList(current, req.body?.unavailableItems);
    }
    const doc = await StoreSettings.findOneAndUpdate(
      { key: "main" },
      { $set: availabilityUpdate(next, now) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).select(AVAILABILITY_FIELDS).lean();
    res.json(availabilityLists(doc, now));
  } catch {
    res.status(500).json({ msg: "Error al actualizar disponibilidad" });
  }
};

export const getDeliveryCommissions = async (req, res) => {
  try {
    const doc = await StoreSettings.findOne({ key: "main" }).select("deliveryCommissions").lean();
    res.json({ deliveryCommissions: commissionsResponse(doc) });
  } catch {
    res.status(500).json({ msg: "Error al obtener las comisiones de delivery" });
  }
};

export const setDeliveryCommissions = async (req, res) => {
  let clean;
  try {
    clean = sanitizeDeliveryCommissions(req.body?.deliveryCommissions);
  } catch (error) {
    if (error instanceof PosOrderValidationError) return res.status(400).json({ msg: error.message });
    throw error;
  }
  try {
    const update = Object.fromEntries(
      Object.entries(clean).map(([platform, rate]) => [`deliveryCommissions.${platform}`, rate])
    );
    const doc = await StoreSettings.findOneAndUpdate(
      { key: "main" },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ deliveryCommissions: commissionsResponse(doc) });
  } catch {
    res.status(500).json({ msg: "Error al guardar las comisiones de delivery" });
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
