import Order from "../models/Order.js";
import PromoCode from "../models/PromoCode.js";
import User from "../models/User.js";
import { computePricing } from "../pricing.js";

// 100 puntos = $25 MXN
const POINTS_PER_REWARD = 100;
const REWARD_VALUE_MXN  = 25;

const hasRequiredBowlFields = ({ base, proteins }) => {
  return Boolean(base && Array.isArray(proteins) && proteins.length >= 1);
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
      pointsToRedeem,
    } = req.body;

    const selectedProteins = Array.isArray(proteins)
      ? proteins
      : protein
        ? [protein]
        : [];

    if (!hasRequiredBowlFields({ base, proteins: selectedProteins })) {
      return res.status(400).json({ msg: "Selecciona una base y al menos 1 proteína para confirmar" });
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
    const { subtotal, discount: promoDiscount, tax, total: baseTotal } = computePricing(resolvedBowlSize, resolvedPromo);

    if (promoDoc) {
      await PromoCode.findByIdAndUpdate(promoDoc._id, { $inc: { usedCount: 1 } });
    }

    // Points redemption (logged-in users only, multiples of 100)
    let pointsDiscount = 0;
    let redeemedPoints = 0;
    if (pointsToRedeem && req.userId) {
      const redeemAmt = Math.floor(Number(pointsToRedeem) / POINTS_PER_REWARD) * POINTS_PER_REWARD;
      if (redeemAmt >= POINTS_PER_REWARD) {
        const userDoc = await User.findById(req.userId);
        if (userDoc && userDoc.points >= redeemAmt) {
          pointsDiscount = (redeemAmt / POINTS_PER_REWARD) * REWARD_VALUE_MXN;
          redeemedPoints = redeemAmt;
          await User.findByIdAndUpdate(req.userId, { $inc: { points: -redeemAmt } });
        }
      }
    }

    const totalDiscount = promoDiscount + pointsDiscount;
    const finalTotal = Math.max(0, baseTotal - pointsDiscount);

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
      promoCode:      promoDoc?.code || null,
      subtotal,
      discountAmount: totalDiscount,
      tax,
      total:          finalTotal,
      pointsRedeemed: redeemedPoints,
      scheduledPickupTime: resolvedScheduledTime,
      isScheduled,
    });

    res.status(201).json({ order });
  } catch {
    res.status(500).json({ msg: "Error creando la orden" });
  }
};

const CANCEL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: "Orden no encontrada" });

    if (order.user && req.userId && String(order.user) !== String(req.userId)) {
      return res.status(403).json({ msg: "No autorizado" });
    }

    if (order.status !== "pending") {
      return res.status(400).json({ msg: "Solo puedes cancelar mientras tu orden está pendiente" });
    }

    if (Date.now() - new Date(order.createdAt).getTime() > CANCEL_WINDOW_MS) {
      return res.status(400).json({ msg: "Ya pasó el tiempo límite para cancelar (5 min)" });
    }

    if (order.pointsRedeemed > 0 && order.user) {
      await User.findByIdAndUpdate(order.user, { $inc: { points: order.pointsRedeemed } });
    }

    order.status = "cancelled";
    await order.save();
    res.json({ order });
  } catch {
    res.status(500).json({ msg: "Error cancelando la orden" });
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
