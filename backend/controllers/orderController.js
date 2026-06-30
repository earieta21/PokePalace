import Order from "../models/Order.js";
import PromoCode from "../models/PromoCode.js";
import { computePricing } from "../pricing.js";

const hasRequiredBowlFields = ({ base, proteins }) => {
  return Boolean(base && Array.isArray(proteins) && proteins.length >= 2);
};

const OPEN_HOUR = 10;
const CLOSE_HOUR = 21;

const validateScheduledTime = (scheduledPickupTime) => {
  const scheduled = new Date(scheduledPickupTime);
  if (isNaN(scheduled.getTime())) return "Hora programada inválida";

  const now = new Date();
  const minTime = new Date(now.getTime() + 15 * 60 * 1000);
  if (scheduled < minTime) return "La hora debe ser al menos 15 minutos desde ahora";

  const hour = scheduled.getHours();
  if (hour < OPEN_HOUR || hour >= CLOSE_HOUR) {
    return `El restaurante acepta pedidos de ${OPEN_HOUR}:00 a ${CLOSE_HOUR}:00`;
  }

  return null;
};

export const createOrder = async (req, res) => {
  try {
    const {
      base,
      protein,
      proteins,
      bowlSize,
      marinades,
      complements,
      sauces,
      toppings,
      customer,
      phone,
      notes,
      fulfillment,
      paymentMethod,
      promoCode,
      scheduledPickupTime,
    } = req.body;

    const selectedProteins = Array.isArray(proteins)
      ? proteins
      : protein
        ? [protein]
        : [];

    if (!hasRequiredBowlFields({ base, proteins: selectedProteins })) {
      return res.status(400).json({ msg: "Selecciona una base y 2 proteínas para confirmar" });
    }

    if (selectedProteins.length > 3) {
      return res.status(400).json({ msg: "Puedes elegir máximo 3 proteínas" });
    }

    if (!customer?.trim() || !phone?.trim()) {
      return res.status(400).json({ msg: "Agrega tu nombre y teléfono para confirmar" });
    }

    // Validate scheduled pickup time
    let resolvedScheduledTime = null;
    let isScheduled = false;
    if (scheduledPickupTime) {
      const timeError = validateScheduledTime(scheduledPickupTime);
      if (timeError) return res.status(400).json({ msg: timeError });
      resolvedScheduledTime = new Date(scheduledPickupTime);
      isScheduled = true;
    }

    // Validate promo code
    let resolvedPromo = null;
    let promoDoc = null;
    if (promoCode?.trim()) {
      promoDoc = await PromoCode.findOne({
        code: promoCode.trim().toUpperCase(),
        isActive: true,
      });

      if (!promoDoc) return res.status(400).json({ msg: "Código promocional inválido o expirado" });
      if (promoDoc.expiresAt && new Date() > promoDoc.expiresAt) {
        return res.status(400).json({ msg: "El código promocional ya expiró" });
      }
      if (promoDoc.maxUses !== null && promoDoc.usedCount >= promoDoc.maxUses) {
        return res.status(400).json({ msg: "El código ya alcanzó su límite de usos" });
      }

      resolvedPromo = { discountType: promoDoc.discountType, discountValue: promoDoc.discountValue };
    }

    const resolvedBowlSize = bowlSize || (selectedProteins.length === 3 ? "large" : "normal");
    const { subtotal, discount, tax, total } = computePricing(resolvedBowlSize, resolvedPromo);

    if (promoDoc) {
      await PromoCode.findByIdAndUpdate(promoDoc._id, { $inc: { usedCount: 1 } });
    }

    const order = await Order.create({
      user: req.userId || null,
      customer: customer.trim(),
      phone: phone.trim(),
      notes: notes?.trim() || null,
      fulfillment: fulfillment || "pickup",
      paymentMethod: paymentMethod || "pay_at_pickup",
      paymentStatus: "pending",
      source: "online",
      base,
      protein: selectedProteins.join(", "),
      proteins: selectedProteins,
      bowlSize: resolvedBowlSize,
      proteinUpcharge: selectedProteins.length === 3 ? 1 : 0,
      marinades: Array.isArray(marinades) ? marinades : [],
      complements: Array.isArray(complements) ? complements : [],
      sauces: Array.isArray(sauces) ? sauces : [],
      toppings: Array.isArray(toppings) ? toppings : [],
      promoCode: promoDoc?.code || null,
      subtotal,
      discountAmount: discount,
      tax,
      total,
      scheduledPickupTime: resolvedScheduledTime,
      isScheduled,
    });

    res.status(201).json({ order });
  } catch {
    res.status(500).json({ msg: "Error creando la orden" });
  }
};

export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(30);

    res.json({ orders });
  } catch {
    res.status(500).json({ msg: "Error obteniendo órdenes" });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const filter = req.userId
      ? { _id: req.params.id, $or: [{ user: req.userId }, { user: null }] }
      : { _id: req.params.id, user: null };

    const order = await Order.findOne(filter);
    if (!order) return res.status(404).json({ msg: "Orden no encontrada" });
    res.json({ order });
  } catch {
    res.status(500).json({ msg: "Error obteniendo la orden" });
  }
};
