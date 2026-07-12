import Order from "../models/Order.js";
import PromoCode from "../models/PromoCode.js";
import User from "../models/User.js";
import { computePricing } from "../pricing.js";
import { sendEmail, orderConfirmationEmail } from "../utils/notify.js";
import { expireStalePoints } from "../utils/loyalty.js";

// 100 puntos = $25 MXN
const POINTS_PER_REWARD = 100;
const REWARD_VALUE_MXN  = 25;

const hasRequiredBowlFields = ({ base, proteins }) => {
  return Boolean(base && Array.isArray(proteins) && proteins.length >= 1);
};

const OPEN_HOUR = 11;
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

    // Validate promo code — read first for a specific error message, then
    // reserve the use atomically so two concurrent requests can't both slip
    // through on the last remaining use of a limited code.
    let resolvedPromo = null;
    let promoDoc = null;
    if (promoCode?.trim()) {
      const codeUpper = promoCode.trim().toUpperCase();
      const precheck = await PromoCode.findOne({ code: codeUpper, isActive: true });

      if (!precheck) return res.status(400).json({ msg: "Código promocional inválido o expirado" });
      if (precheck.expiresAt && new Date() > precheck.expiresAt) {
        return res.status(400).json({ msg: "El código promocional ya expiró" });
      }
      if (precheck.maxUses !== null && precheck.usedCount >= precheck.maxUses) {
        return res.status(400).json({ msg: "El código ya alcanzó su límite de usos" });
      }

      promoDoc = await PromoCode.findOneAndUpdate(
        {
          code: codeUpper,
          isActive: true,
          $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
          $expr: {
            $or: [
              { $eq: ["$maxUses", null] },
              { $lt: ["$usedCount", "$maxUses"] },
            ],
          },
        },
        { $inc: { usedCount: 1 } },
        { new: false }
      );

      // Lost the race for the last use between the precheck and now
      if (!promoDoc) return res.status(400).json({ msg: "El código ya alcanzó su límite de usos" });

      resolvedPromo = { discountType: promoDoc.discountType, discountValue: promoDoc.discountValue };
    }

    const resolvedBowlSize = bowlSize || (selectedProteins.length === 3 ? "large" : "normal");
    const { subtotal, discount: promoDiscount, tax, total: baseTotal } = computePricing(resolvedBowlSize, resolvedPromo);

    // Points redemption (logged-in users only, multiples of 100).
    // The conditional decrement (points: { $gte: redeemAmt }) happens in the
    // same atomic operation as the check, so firing multiple simultaneous
    // requests can't redeem the same points balance more than once.
    let pointsDiscount = 0;
    let redeemedPoints = 0;
    if (pointsToRedeem && req.userId) {
      await expireStalePoints(req.userId);
      const redeemAmt = Math.floor(Number(pointsToRedeem) / POINTS_PER_REWARD) * POINTS_PER_REWARD;
      if (redeemAmt >= POINTS_PER_REWARD) {
        const updatedUser = await User.findOneAndUpdate(
          { _id: req.userId, points: { $gte: redeemAmt } },
          { $inc: { points: -redeemAmt } },
          { new: true }
        );
        if (updatedUser) {
          pointsDiscount = (redeemAmt / POINTS_PER_REWARD) * REWARD_VALUE_MXN;
          redeemedPoints = redeemAmt;
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

    // Email de confirmación (solo usuarios logueados — los invitados no dan email).
    // Fire-and-forget después de responder: no retrasa ni rompe la creación.
    if (req.userId) {
      User.findById(req.userId)
        .then((u) => {
          if (!u?.email) return;
          const { subject, html } = orderConfirmationEmail(order);
          return sendEmail({ to: u.email, subject, html });
        })
        .catch((err) => console.error("confirmation email error:", err.message));
    }
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

export const getWaitTime = async (req, res) => {
  try {
    const activeOrders = await Order.countDocuments({
      status: { $in: ["pending", "preparing"] },
    });
    const waitMinutes = Math.max(8, 8 + activeOrders * 3);
    res.json({ activeOrders, waitMinutes });
  } catch {
    res.status(500).json({ msg: "Error" });
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
