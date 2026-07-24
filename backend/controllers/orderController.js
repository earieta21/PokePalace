import Order from "../models/Order.js";
import PromoCode from "../models/PromoCode.js";
import User from "../models/User.js";
import StoreSettings from "../models/StoreSettings.js";
import mongoose from "mongoose";
import { computePricing } from "../pricing.js";
import { sendEmail, orderConfirmationEmail } from "../utils/notify.js";
import { createPaymentLink, getPaymentLinkStatus } from "../utils/clip.js";
import { expireStalePoints } from "../utils/loyalty.js";
import {
  generateOrderAccessToken,
  hashOrderAccessToken,
  orderAccessTokenMatches,
} from "../utils/orderAccess.js";
import {
  findUnavailableCustomerBowlItems,
  isCustomerManagedOrder,
  isWithinRestaurantHours,
  normalizeCustomerOrderId,
  sanitizeCustomerBowl,
  usefulPointsToRedeem,
} from "../utils/customerOrder.js";
import { stableCustomerOrderObjectId } from "../utils/orderReservations.js";

// 100 puntos = $25 MXN
const POINTS_PER_REWARD = 100;
const REWARD_VALUE_MXN  = 25;
const ORDER_TOKEN_HEADER = "x-order-token";

const requestOrderToken = (req) => {
  const value = req.get(ORDER_TOKEN_HEADER);
  return typeof value === "string" && value.length <= 256 ? value.trim() : "";
};

const customerCanAccessOrder = (req, order) => {
  if (order.user) {
    return Boolean(req.userId) && String(order.user) === String(req.userId);
  }
  return orderAccessTokenMatches(requestOrderToken(req), order.guestAccessTokenHash);
};

const sendOrderNotFound = (res) => res.status(404).json({ msg: "Orden no encontrada" });

const OPEN_HOUR = 11;
const CLOSE_HOUR = 21;

const isWithinBusinessHours = (date) => {
  return isWithinRestaurantHours(date, OPEN_HOUR, CLOSE_HOUR);
};

const validateScheduledTime = (scheduledPickupTime) => {
  const scheduled = new Date(scheduledPickupTime);
  if (isNaN(scheduled.getTime())) return "Hora programada inválida";

  const now = new Date();
  const minTime = new Date(now.getTime() + 15 * 60 * 1000);
  if (scheduled < minTime) return "La hora debe ser al menos 15 minutos desde ahora";

  if (!isWithinBusinessHours(scheduled)) {
    return `El restaurante acepta pedidos de ${OPEN_HOUR}:00 a ${CLOSE_HOUR}:00`;
  }

  return null;
};

const isStrongGuestToken = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{32,256}$/.test(value);

const findAuthorizedIdempotentOrder = async (req, clientOrderId) => {
  if (!clientOrderId) return null;
  const existing = await Order.findOne({ clientOrderId }).select("+guestAccessTokenHash");
  if (!existing) return null;
  if (!isCustomerManagedOrder(existing) || !customerCanAccessOrder(req, existing)) {
    const conflict = new Error("clientOrderId ya pertenece a otra orden");
    conflict.status = 409;
    throw conflict;
  }
  return existing;
};

const requestError = (message, status) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const findReservedPromo = (attemptOrderId) => PromoCode.findOne({
  reservedOrderUses: attemptOrderId,
}).select("+reservedOrderUses");

const assertSameReservedPromo = (promo, requestedCode) => {
  if (promo && requestedCode && promo.code !== requestedCode) {
    throw requestError(
      "Este intento ya reservó otro código promocional. Reintenta el pedido original.",
      409
    );
  }
  return promo;
};

const reservePromoUse = async (promoCode, attemptOrderId) => {
  const codeUpper = typeof promoCode === "string" ? promoCode.trim().toUpperCase() : "";
  const alreadyReserved = await findReservedPromo(attemptOrderId);
  if (alreadyReserved) return assertSameReservedPromo(alreadyReserved, codeUpper);
  if (!codeUpper) return null;

  const precheck = await PromoCode.findOne({ code: codeUpper, isActive: true });
  if (!precheck) throw requestError("Código promocional inválido o expirado", 400);
  if (precheck.expiresAt && new Date() > precheck.expiresAt) {
    throw requestError("El código promocional ya expiró", 400);
  }
  if (precheck.maxUses !== null && precheck.usedCount >= precheck.maxUses) {
    throw requestError("El código ya alcanzó su límite de usos", 400);
  }

  try {
    const reserved = await PromoCode.findOneAndUpdate(
      {
        code: codeUpper,
        isActive: true,
        reservedOrderUses: { $ne: attemptOrderId },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        $expr: {
          $or: [
            { $eq: ["$maxUses", null] },
            { $lt: ["$usedCount", "$maxUses"] },
          ],
        },
      },
      {
        $inc: { usedCount: 1 },
        $addToSet: { reservedOrderUses: attemptOrderId },
      },
      { new: true }
    ).select("+reservedOrderUses");

    if (reserved) return reserved;
  } catch (error) {
    // Mongo may apply the atomic update and lose only its acknowledgement.
    const recovered = await findReservedPromo(attemptOrderId);
    if (recovered) return assertSameReservedPromo(recovered, codeUpper);
    throw error;
  }

  // A concurrent retry with this same attempt may have won the update.
  const recovered = await findReservedPromo(attemptOrderId);
  if (recovered) return assertSameReservedPromo(recovered, codeUpper);
  throw requestError("El código ya alcanzó su límite de usos", 400);
};

const findPointReservation = async (userId, attemptOrderId) => {
  if (!userId) return null;
  const user = await User.findOne({
    _id: userId,
    "orderPointReservations.orderId": attemptOrderId,
  }).select("points +orderPointReservations");
  if (!user) return null;
  return user.orderPointReservations.find(
    (entry) => String(entry.orderId) === String(attemptOrderId)
  ) || null;
};

const reservePointsUse = async ({ userId, attemptOrderId, requestedPoints, orderTotal }) => {
  if (!userId) return 0;

  const alreadyReserved = await findPointReservation(userId, attemptOrderId);
  if (alreadyReserved) return alreadyReserved.points;
  if (!requestedPoints) return 0;

  await expireStalePoints(userId);
  const rewardsUser = await User.findById(userId).select("points");
  const redeemAmt = usefulPointsToRedeem({
    availablePoints: rewardsUser?.points || 0,
    requestedPoints,
    orderTotal,
    pointsPerReward: POINTS_PER_REWARD,
    rewardValue: REWARD_VALUE_MXN,
  });
  if (redeemAmt < POINTS_PER_REWARD) return 0;

  try {
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: userId,
        points: { $gte: redeemAmt },
        "orderPointReservations.orderId": { $ne: attemptOrderId },
      },
      {
        $inc: { points: -redeemAmt },
        $push: {
          orderPointReservations: {
            orderId: attemptOrderId,
            points: redeemAmt,
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    ).select("points +orderPointReservations");

    const reservation = updatedUser?.orderPointReservations.find(
      (entry) => String(entry.orderId) === String(attemptOrderId)
    );
    if (reservation) return reservation.points;
  } catch (error) {
    const recovered = await findPointReservation(userId, attemptOrderId);
    if (recovered) return recovered.points;
    throw error;
  }

  // Either the balance changed concurrently or this same attempt won first.
  const recovered = await findPointReservation(userId, attemptOrderId);
  return recovered?.points || 0;
};

export const createOrder = async (req, res) => {
  let cleanClientOrderId = null;
  let attemptOrderId = null;
  let guestOrderToken = null;

  try {
    try {
      cleanClientOrderId = normalizeCustomerOrderId(req.body?.clientOrderId);
    } catch (validationError) {
      return res.status(400).json({ msg: validationError.message });
    }

    if (!cleanClientOrderId) {
      return res.status(400).json({
        msg: "Falta el identificador seguro del pedido. Actualiza la página e intenta de nuevo.",
      });
    }
    attemptOrderId = stableCustomerOrderObjectId(cleanClientOrderId);

    const suppliedOrderToken = requestOrderToken(req);
    if (!req.userId && !isStrongGuestToken(suppliedOrderToken)) {
      return res.status(400).json({ msg: "Falta la credencial segura para reintentar esta orden" });
    }

    const existing = await findAuthorizedIdempotentOrder(req, cleanClientOrderId);
    if (existing) {
      return res.status(200).json({
        order: existing,
        ...(suppliedOrderToken ? { orderToken: suppliedOrderToken } : {}),
        ...(existing.clipPaymentUrl ? { paymentUrl: existing.clipPaymentUrl } : {}),
        idempotent: true,
      });
    }

    const storeSettings = await StoreSettings.findOne({ key: "main" })
      .select("ordersPaused pausedMessage unavailableItems");
    if (storeSettings?.ordersPaused) {
      return res.status(503).json({
        msg: storeSettings.pausedMessage?.trim() || "No estamos aceptando pedidos en línea en este momento. Intenta más tarde.",
      });
    }

    const {
      base,
      protein,
      proteins,
      marinades,
      complements,
      sauces,
      toppings,
      extraScoopProteins,
      customer,
      phone,
      notes,
      promoCode,
      scheduledPickupTime,
      pointsToRedeem,
      paymentMethod,
    } = req.body;

    let safeBowl;
    try {
      safeBowl = sanitizeCustomerBowl({
        base,
        protein,
        proteins,
        marinades,
        complements,
        sauces,
        toppings,
        extraScoopProteins,
      });
    } catch (validationError) {
      return res.status(400).json({ msg: validationError.message });
    }

    const unavailableSelections = findUnavailableCustomerBowlItems(
      safeBowl,
      storeSettings?.unavailableItems
    );
    if (unavailableSelections.length > 0) {
      return res.status(409).json({
        msg: "Uno o más ingredientes de tu pedido ya no están disponibles. Actualiza tu selección e intenta de nuevo.",
        code: "ITEM_UNAVAILABLE",
        unavailableItems: unavailableSelections,
      });
    }
    const selectedProteins = safeBowl.proteins;

    const cleanCustomer = typeof customer === "string" ? customer.trim() : "";
    const cleanPhone = typeof phone === "string" ? phone.trim() : "";
    const cleanNotes = typeof notes === "string" ? notes.trim() : "";
    if (!cleanCustomer || !cleanPhone) {
      return res.status(400).json({ msg: "Agrega tu nombre y teléfono para confirmar" });
    }

    // Validate scheduled pickup time — and for orders "for now" (no scheduled
    // time), reject them outright if the restaurant is currently closed
    // instead of silently accepting a pedido nobody will be there to make.
    let resolvedScheduledTime = null;
    let isScheduled = false;
    if (scheduledPickupTime) {
      const timeError = validateScheduledTime(scheduledPickupTime);
      if (timeError) return res.status(400).json({ msg: timeError });
      resolvedScheduledTime = new Date(scheduledPickupTime);
      isScheduled = true;
    } else if (!isWithinBusinessHours(new Date())) {
      return res.status(400).json({
        msg: `El restaurante está cerrado ahora. Aceptamos pedidos de ${OPEN_HOUR}:00 a ${CLOSE_HOUR}:00 — puedes programar tu pedido para más tarde.`,
      });
    }

    // The reservation marker and usedCount increment share one atomic write.
    // If Mongo applies it but the acknowledgement is lost, the same stable
    // attempt id recovers the marker instead of consuming another use.
    const promoDoc = await reservePromoUse(promoCode, attemptOrderId);
    const resolvedPromo = promoDoc
      ? { discountType: promoDoc.discountType, discountValue: promoDoc.discountValue }
      : null;

    const resolvedBowlSize = safeBowl.bowlSize;
    const { subtotal, discount: promoDiscount, tax, total: baseTotal } = computePricing(
      resolvedBowlSize,
      resolvedPromo,
      {
        extraScoops: safeBowl.extraScoopProteins.length,
        complementsCount: safeBowl.complements.length,
        proteins: safeBowl.proteins,
      }
    );

    // The balance decrement and order marker are also one atomic write. A
    // concurrent/reloaded retry reads the durable amount from that marker.
    const redeemedPoints = await reservePointsUse({
      userId: req.userId,
      attemptOrderId,
      requestedPoints: pointsToRedeem,
      orderTotal: baseTotal,
    });
    const pointsDiscount = (redeemedPoints / POINTS_PER_REWARD) * REWARD_VALUE_MXN;

    const totalDiscount = promoDiscount + pointsDiscount;
    const finalTotal = Math.max(0, baseTotal - pointsDiscount);

    guestOrderToken = req.userId
      ? null
      : isStrongGuestToken(suppliedOrderToken)
        ? suppliedOrderToken
        : generateOrderAccessToken();
    const order = await Order.create({
      _id: attemptOrderId,
      clientOrderId: cleanClientOrderId,
      user: req.userId || null,
      guestAccessTokenHash: guestOrderToken ? hashOrderAccessToken(guestOrderToken) : null,
      customer: cleanCustomer,
      phone: cleanPhone,
      notes: cleanNotes || null,
      // Online checkout supports pickup only. Ignore crafted fulfillment values
      // before they can poison an otherwise valid reservation. paymentMethod is
      // whitelisted to "online" (Clip-hosted checkout) or the default
      // pay_at_pickup — any other crafted value is ignored the same way.
      fulfillment: "pickup",
      paymentMethod: paymentMethod === "online" ? "online" : "pay_at_pickup",
      paymentStatus: "pending",
      source: "online",
      base: safeBowl.base,
      protein: selectedProteins.join(", "),
      proteins: selectedProteins,
      bowlSize: resolvedBowlSize,
      proteinUpcharge: selectedProteins.length === 3 ? 1 : 0,
      marinades: safeBowl.marinades,
      complements: safeBowl.complements,
      sauces: safeBowl.sauces,
      toppings: safeBowl.toppings,
      extraScoopProteins: safeBowl.extraScoopProteins,
      promoCode:      promoDoc?.code || null,
      subtotal,
      discountAmount: totalDiscount,
      tax,
      total:          finalTotal,
      pointsRedeemed: redeemedPoints,
      scheduledPickupTime: resolvedScheduledTime,
      isScheduled,
    });

    let paymentUrl = null;
    if (order.paymentMethod === "online") {
      const link = await createPaymentLink({
        orderId: order._id,
        amount: order.total,
        description: `Pedido Poke Palace #${order._id.toString().slice(-6).toUpperCase()}`,
      });
      if (link) {
        order.clipPaymentRequestId = link.paymentRequestId;
        order.clipPaymentUrl = link.url;
        await order.save();
        paymentUrl = link.url;
      }
    }

    res.status(201).json({
      order,
      ...(guestOrderToken ? { orderToken: guestOrderToken } : {}),
      ...(paymentUrl ? { paymentUrl } : {}),
    });

    // Guarda el teléfono en el perfil del cliente logueado para no volver a
    // pedírselo en su próximo pedido. Fire-and-forget, no bloquea la respuesta.
    if (req.userId && cleanPhone) {
      User.findByIdAndUpdate(req.userId, { phone: cleanPhone })
        .catch((err) => console.error("save phone error:", err.message));
    }

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
  } catch (error) {
    // If Mongo persisted this exact attempt but its acknowledgement was lost,
    // its durable reservations are valid. Return the order when creation won.
    if (attemptOrderId) {
      try {
        const ownOrder = await Order.findById(attemptOrderId).select("+guestAccessTokenHash");
        const canRecoverOwnGuestOrder = Boolean(
          !req.userId &&
          guestOrderToken &&
          orderAccessTokenMatches(guestOrderToken, ownOrder?.guestAccessTokenHash)
        );
        if (
          ownOrder &&
          isCustomerManagedOrder(ownOrder) &&
          (customerCanAccessOrder(req, ownOrder) || canRecoverOwnGuestOrder)
        ) {
          return res.status(200).json({
            order: ownOrder,
            ...(guestOrderToken ? { orderToken: guestOrderToken } : {}),
            ...(ownOrder.clipPaymentUrl ? { paymentUrl: ownOrder.clipPaymentUrl } : {}),
            idempotent: true,
          });
        }
      } catch (lookupError) {
        console.error("customer order recovery lookup error:", lookupError.message);
      }

    }

    if (error?.code === 11000 && cleanClientOrderId) {
      try {
        const existing = await findAuthorizedIdempotentOrder(req, cleanClientOrderId);
        if (existing) {
          const suppliedOrderToken = requestOrderToken(req);
          return res.status(200).json({
            order: existing,
            ...(suppliedOrderToken ? { orderToken: suppliedOrderToken } : {}),
            ...(existing.clipPaymentUrl ? { paymentUrl: existing.clipPaymentUrl } : {}),
            idempotent: true,
          });
        }
      } catch (conflictError) {
        return res.status(conflictError.status || 409).json({ msg: conflictError.message });
      }
    }

    if (error?.status) return res.status(error.status).json({ msg: error.message });
    console.error("createOrder error:", error?.message || error);
    // Do not guess whether an acknowledged-looking write was applied and do
    // not refund while another identical request may still be completing.
    // The browser keeps clientOrderId, so the next retry resumes these exact
    // reservation markers and either creates or recovers the same order.
    return res.status(503).json({
      msg: "No pudimos conciliar la orden todavía. Reintenta con el mismo pedido.",
      retryable: true,
      clientOrderId: cleanClientOrderId,
    });
  }
};

const CANCEL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

const refundRedeemedPointsOnce = async (order) => {
  if (!(order.pointsRedeemed > 0) || !order.user || order.pointsRefundedAt) return;

  // Orders cancelled before the durable cancellation ledger was introduced
  // have no cancelledAt marker. The old endpoint refunded points before it
  // saved status="cancelled", so crediting them here would pay the same refund
  // a second time. Adopt those orders into the new ledger without changing the
  // balance; cancellations made by this version always set cancelledAt first.
  if (order.status === "cancelled" && !order.cancelledAt) {
    const legacyUser = await User.updateOne(
      { _id: order.user },
      { $addToSet: { cancelledOrderRefunds: order._id } }
    );
    if (legacyUser.matchedCount === 0) {
      throw new Error("No se encontró la cuenta Rewards de la cancelación anterior");
    }
    await Order.updateOne(
      { _id: order._id, pointsRefundedAt: null },
      { $set: { pointsRefundedAt: new Date() } }
    );
    return;
  }

  const result = await User.updateOne(
    { _id: order.user, cancelledOrderRefunds: { $ne: order._id } },
    {
      $inc: { points: order.pointsRedeemed },
      $addToSet: { cancelledOrderRefunds: order._id },
    }
  );

  if (result.matchedCount === 0) {
    const alreadyRefunded = await User.exists({
      _id: order.user,
      cancelledOrderRefunds: order._id,
    });
    if (!alreadyRefunded) {
      throw new Error("No se encontró la cuenta Rewards para devolver los puntos");
    }
  }

  await Order.updateOne(
    { _id: order._id, pointsRefundedAt: null },
    { $set: { pointsRefundedAt: new Date() } }
  );
};

const releasePromoUseOnce = async (order) => {
  if (!order.promoCode || order.promoUseReleasedAt) return;

  const promo = await PromoCode.findOne({ code: order.promoCode })
    .select("+reservedOrderUses +releasedOrderUses");
  if (promo) {
    const released = await PromoCode.updateOne(
      {
        _id: promo._id,
        reservedOrderUses: order._id,
        releasedOrderUses: { $ne: order._id },
        usedCount: { $gt: 0 },
      },
      {
        $inc: { usedCount: -1 },
        $pull: { reservedOrderUses: order._id },
        $addToSet: { releasedOrderUses: order._id },
      }
    );

    // Legacy orders predate reservedOrderUses. Keep their original safe
    // release behavior, while never allowing the counter to become negative.
    if (released.matchedCount === 0) {
      const alreadyReleased = promo.releasedOrderUses.some(
        (id) => String(id) === String(order._id)
      );
      if (!alreadyReleased) {
        const legacyReleased = await PromoCode.updateOne(
          {
            _id: promo._id,
            reservedOrderUses: { $ne: order._id },
            releasedOrderUses: { $ne: order._id },
            usedCount: { $gt: 0 },
          },
          {
            $inc: { usedCount: -1 },
            $addToSet: { releasedOrderUses: order._id },
          }
        );
        if (legacyReleased.matchedCount === 0) {
          await PromoCode.updateOne(
            { _id: promo._id, releasedOrderUses: { $ne: order._id }, usedCount: { $lte: 0 } },
            {
              $pull: { reservedOrderUses: order._id },
              $addToSet: { releasedOrderUses: order._id },
            }
          );
        }
      }
    }
  }

  await Order.updateOne(
    { _id: order._id, promoUseReleasedAt: null },
    { $set: { promoUseReleasedAt: new Date() } }
  );
};

export const reconcileOnlineOrderCancellation = async (order) => {
  // POS cancellation has its own staff-side inventory/reward reconciliation.
  if (!isCustomerManagedOrder(order)) return order;
  if (order.cancellationReversedAt) return Order.findById(order._id);

  await refundRedeemedPointsOnce(order);

  // Re-read the order so a retry observes a points marker written immediately
  // before a process/network interruption.
  const afterPoints = await Order.findById(order._id);
  if (!afterPoints) throw new Error("La orden desapareció durante la cancelación");

  await releasePromoUseOnce(afterPoints);

  return Order.findOneAndUpdate(
    { _id: order._id, status: "cancelled" },
    { $set: { cancellationReversedAt: new Date() } },
    { new: true }
  );
};

export const cancelOrder = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return sendOrderNotFound(res);

    let order = await Order.findById(req.params.id).select("+guestAccessTokenHash");
    if (!order || !customerCanAccessOrder(req, order)) return sendOrderNotFound(res);
    if (!isCustomerManagedOrder(order)) return sendOrderNotFound(res);

    // A repeated authorized request finishes any interrupted compensation but
    // cannot apply the points or promo release twice.
    if (order.status === "cancelled") {
      const reconciled = await reconcileOnlineOrderCancellation(order);
      return res.json({ order: reconciled });
    }

    if (order.status !== "pending") {
      return res.status(400).json({ msg: "Solo puedes cancelar mientras tu orden está pendiente" });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({
        msg: "Esta orden ya fue cobrada. Contacta al local para solicitar una cancelación.",
      });
    }

    if (Date.now() - new Date(order.createdAt).getTime() > CANCEL_WINDOW_MS) {
      return res.status(400).json({ msg: "Ya pasó el tiempo límite para cancelar (5 min)" });
    }

    const cancelled = await Order.findOneAndUpdate(
      {
        _id: order._id,
        status: "pending",
        paymentStatus: { $ne: "paid" },
        createdAt: { $gte: new Date(Date.now() - CANCEL_WINDOW_MS) },
      },
      { $set: { status: "cancelled", cancelledAt: new Date() } },
      { new: true }
    );

    if (!cancelled) {
      // Another authorized request may have won the atomic status transition.
      order = await Order.findById(order._id).select("+guestAccessTokenHash");
      if (order?.status === "pending" && order.paymentStatus === "paid") {
        return res.status(400).json({
          msg: "Esta orden ya fue cobrada. Contacta al local para solicitar una cancelación.",
        });
      }
      if (order?.status === "cancelled") {
        const reconciled = await reconcileOnlineOrderCancellation(order);
        return res.json({ order: reconciled });
      }
      if (order?.status === "pending" && Date.now() - new Date(order.createdAt).getTime() > CANCEL_WINDOW_MS) {
        return res.status(400).json({ msg: "Ya pasó el tiempo límite para cancelar (5 min)" });
      }
      return res.status(409).json({ msg: "La orden cambió de estado; actualiza e intenta de nuevo" });
    }

    const reconciled = await reconcileOnlineOrderCancellation(cancelled);
    return res.json({ order: reconciled });
  } catch (error) {
    console.error("cancelOrder error:", error.message);
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
    const pendingReversals = await Order.find({
      user: req.userId,
      source: "online",
      status: "cancelled",
      cancellationReversedAt: null,
    }).sort({ createdAt: -1 }).limit(10);

    for (const order of pendingReversals) {
      await reconcileOnlineOrderCancellation(order);
    }

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
    if (!mongoose.isValidObjectId(req.params.id)) return sendOrderNotFound(res);

    const order = await Order.findById(req.params.id).select("+guestAccessTokenHash");
    if (!order || !customerCanAccessOrder(req, order)) return sendOrderNotFound(res);

    // If the original cancellation response was interrupted after the status
    // changed, normal tracking polling completes the durable compensation.
    if (isCustomerManagedOrder(order) && order.status === "cancelled" && !order.cancellationReversedAt) {
      const reconciled = await reconcileOnlineOrderCancellation(order);
      return res.json({ order: reconciled });
    }
    res.json({ order });
  } catch (error) {
    console.error("getOrderById error:", error.message);
    res.status(500).json({ msg: "Error obteniendo la orden" });
  }
};

/* Clip no documenta firma/secreto para verificar sus webhooks, así que el
   body nunca se usa como fuente de verdad: solo dispara una consulta
   autenticada server-to-server a Clip para confirmar el estado real antes
   de marcar el pedido como pagado. */
export const clipWebhook = async (req, res) => {
  res.sendStatus(200); // Clip solo necesita el 200; el resto es best-effort.

  try {
    const paymentRequestId = req.body?.payment_request_id;
    if (!paymentRequestId) return;

    const order = await Order.findOne({ clipPaymentRequestId: paymentRequestId });
    if (!order || order.paymentStatus === "paid") return;

    const status = await getPaymentLinkStatus(paymentRequestId);
    if (status?.status === "CHECKOUT_COMPLETED") {
      order.paymentStatus = "paid";
      await order.save();
    }
  } catch (err) {
    console.error("clipWebhook error:", err.message);
  }
};
