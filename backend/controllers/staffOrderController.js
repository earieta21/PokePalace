import Order from "../models/Order.js";
import Inventory from "../models/Inventory.js";
import User from "../models/User.js";
import Expense from "../models/Expense.js";
import Redemption from "../models/Redemption.js";
import { sendSMS, sendWhatsApp } from "../utils/notify.js";
import { GOLD_TIER_MIN_POINTS, GOLD_POINTS_MULTIPLIER } from "../utils/loyalty.js";
import { getRewardById } from "../config/rewardsCatalog.js";
import { computeBowlSubtotal } from "../pricing.js";

/* ── inventory auto-deduction ── */
async function deductInventory(order) {
  try {
    const keys = new Set();
    if (order.base) keys.add(order.base);
    (order.proteins    || []).forEach((k) => keys.add(k));
    (order.marinades   || []).forEach((k) => keys.add(k));
    (order.complements || []).forEach((k) => keys.add(k));
    (order.sauces      || []).forEach((k) => keys.add(k));
    (order.toppings    || []).forEach((k) => keys.add(k));
    (order.items       || []).forEach((it) => {
      if (it.name) keys.add(it.name.toLowerCase().replace(/\s+/g, "_"));
    });

    if (keys.size === 0) return;
    const invItems = await Inventory.find({ menuKeys: { $in: [...keys] } });
    if (invItems.length === 0) return;

    await Promise.all(
      invItems.map((it) => Inventory.findByIdAndUpdate(it._id, { $inc: { qty: -1 } }))
    );
    await Order.findByIdAndUpdate(order._id, { ingredientsDeducted: true });
  } catch (err) {
    console.error("deductInventory error:", err.message);
  }
}

/* ── loyalty point award: 1 point per $10 MXN, 2x for customers already in
   Oro (300+ lifetimePoints) at the time they placed the order. Tier is read
   from lifetimePoints — an achievement that only goes up — never from the
   spendable balance, so redeeming a reward can't knock someone out of Oro.
   Guarded atomically on loyaltyPointsEarned so calling markAsPaid more than
   once on the same order (double click, retry, repeated API call) can never
   award points twice — the conditional update only succeeds the first time. ── */
async function awardLoyaltyPoints(order) {
  try {
    if (!order.user || !order.total || order.total <= 0) return;
    const basePoints = Math.floor(order.total / 10);
    if (basePoints <= 0) return;

    const userDoc = await User.findById(order.user).select("lifetimePoints");
    const isGold = (userDoc?.lifetimePoints ?? 0) >= GOLD_TIER_MIN_POINTS;
    const earned = basePoints * (isGold ? GOLD_POINTS_MULTIPLIER : 1);

    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, loyaltyPointsEarned: 0 },
      { loyaltyPointsEarned: earned },
      { new: true }
    );
    if (!claimed) return; // already awarded on a previous call — do nothing

    await User.findByIdAndUpdate(order.user, {
      $inc: { points: earned, lifetimePoints: earned },
      $set: { pointsLastEarnedAt: new Date() },
    });
  } catch (err) {
    console.error("awardLoyaltyPoints error:", err.message);
  }
}

/* ── helpers ── */
const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/* GET /api/staff/orders
   query: status (comma-separated), source, limit, skip */
export const getAllOrders = async (req, res) => {
  try {
    const { status, source, limit = 100, skip = 0 } = req.query;
    const filter = {};
    if (status) filter.status = { $in: status.split(",") };
    if (source) filter.source = source;

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .populate("user", "name email");

    res.json({ orders });
  } catch (err) {
    res.status(500).json({ message: "Error fetching orders", err: err.message });
  }
};

/* PATCH /api/staff/orders/:id/pay */
export const markAsPaid = async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { paymentStatus: "paid" },
      { new: true }
    ).populate("user", "name email");
    if (!order) return res.status(404).json({ message: "Orden no encontrada" });

    // Fire-and-forget: deduct inventory + award loyalty points
    if (!order.ingredientsDeducted) deductInventory(order);
    if (order.source === "online") awardLoyaltyPoints(order);

    res.json({ order });
  } catch (err) {
    res.status(500).json({ message: "Error al marcar pago", err: err.message });
  }
};

/* PATCH /api/staff/orders/:id/status */
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const VALID = ["pending", "preparing", "ready", "completed", "cancelled"];
    if (!VALID.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const prev = await Order.findById(req.params.id).select("status");
    if (!prev) return res.status(404).json({ message: "Order not found" });

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate("user", "name email");

    res.json({ order });

    // Aviso al cliente cuando su pedido pasa a "listo" (una sola vez, solo pedidos online).
    // Intenta WhatsApp primero; si no está configurado o falla, cae a SMS.
    if (status === "ready" && prev.status !== "ready" && order.source === "online" && order.phone) {
      const num = String(order._id).slice(-5).toUpperCase();
      const template = process.env.WHATSAPP_TEMPLATE_READY || "pedido_listo";
      sendWhatsApp(order.phone, template, [num])
        .then((sent) => {
          if (!sent) {
            return sendSMS(
              order.phone,
              `Poke Palace: ¡Tu pedido #${num} está listo! 🥢 Pasa a recogerlo. Plaza La Estación, Local 24.`
            );
          }
        })
        .catch((err) => console.error("ready notification error:", err.message));
    }
  } catch (err) {
    res.status(500).json({ message: "Error updating order", err: err.message });
  }
};

/* GET /api/staff/orders/stats — today's KPIs */
export const getOrderStats = async (req, res) => {
  try {
    const since = todayStart();
    const orders = await Order.find({ createdAt: { $gte: since } });

    const revenue = orders
      .filter((o) => o.total != null)
      .reduce((s, o) => s + o.total, 0);

    res.json({
      total:     orders.length,
      pending:   orders.filter((o) => o.status === "pending").length,
      preparing: orders.filter((o) => o.status === "preparing").length,
      ready:     orders.filter((o) => o.status === "ready").length,
      completed: orders.filter((o) => o.status === "completed").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
      revenue:   parseFloat(revenue.toFixed(2)),
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching stats", err: err.message });
  }
};

/* POST /api/staff/orders — POS order.
   Supports quick-menu items, a cashier-built custom bowl, or both in one ticket. */
export const createPosOrder = async (req, res) => {
  try {
    const {
      items, customer, phone, notes, fulfillment, paymentMethod, rewardCode,
      base, proteins, bowlSize, marinades, complements, sauces, toppings,
    } = req.body;

    const hasItems = Array.isArray(items) && items.length > 0;
    const hasBowl = Boolean(base) && Array.isArray(proteins) && proteins.length >= 2;

    if (!hasItems && !hasBowl) {
      return res.status(400).json({ message: "items or a custom bowl are required" });
    }

    const safeItems = hasItems
      ? items.map((item) => ({
          name: String(item.name || "").trim(),
          price: Math.max(0, Number(item.price) || 0),
          qty: Math.max(1, Math.floor(Number(item.qty) || 1)),
        }))
      : [];
    const itemsSubtotal = safeItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const customBowlPrice = hasBowl
      ? computeBowlSubtotal(bowlSize || (proteins.length === 3 ? "large" : "normal"))
      : 0;
    const subtotal = itemsSubtotal + customBowlPrice;

    let redemption = null;
    let rewardDiscount = 0;
    const cleanRewardCode = rewardCode?.trim().toUpperCase();
    if (cleanRewardCode) {
      redemption = await Redemption.findOne({ code: cleanRewardCode, status: "active" });
      if (!redemption || (redemption.expiresAt && redemption.expiresAt <= new Date())) {
        return res.status(400).json({ message: "Código de premio inválido o vencido" });
      }
      const reward = getRewardById(redemption.rewardId);
      if (!reward) return res.status(400).json({ message: "Premio no disponible" });

      const bowlItems = safeItems.filter((item) => /bowl|pollo teriyaki/i.test(item.name));
      const orderHasBowl = hasBowl || bowlItems.length > 0;
      if (!orderHasBowl) {
        return res.status(400).json({ message: "Este premio requiere un bowl en la orden" });
      }

      if (reward.type === "free_drink") {
        const drinks = safeItems.filter((item) => /agua de coco|limonada de matcha/i.test(item.name));
        if (!drinks.length) {
          return res.status(400).json({ message: "Agrega Agua de Coco o Limonada de Matcha a la orden" });
        }
        rewardDiscount = Math.min(...drinks.map((item) => item.price));
      } else if (reward.type === "double_protein") {
        if (!hasBowl || proteins.length < 3) {
          return res.status(400).json({ message: "Proteína doble requiere un bowl personalizado grande" });
        }
        rewardDiscount = 40;
      } else if (reward.type === "free_bowl") {
        const eligibleBowlPrice = hasBowl ? customBowlPrice : Math.min(...bowlItems.map((item) => item.price));
        rewardDiscount = Math.min(249, eligibleBowlPrice);
      }
      rewardDiscount = Math.min(rewardDiscount, subtotal);
    }

    const total = Math.max(0, subtotal - rewardDiscount);

    const order = await Order.create({
      staffId: req.staff.id,
      items: safeItems,
      customer: customer || "Walk-in",
      phone: phone || null,
      notes: notes || null,
      fulfillment: fulfillment || "pickup",
      paymentMethod: paymentMethod || "card_terminal",
      paymentStatus: "paid",
      source: "pos",
      subtotal,
      discountAmount: rewardDiscount,
      total,
      rewardRedemption: redemption?._id || null,
      rewardCode: redemption?.code || null,
      status: "pending",
      ...(hasBowl && {
        base,
        protein: proteins.join(", "),
        proteins,
        bowlSize: bowlSize || (proteins.length === 3 ? "large" : "normal"),
        proteinUpcharge: proteins.length === 3 ? 1 : 0,
        marinades: Array.isArray(marinades) ? marinades : [],
        complements: Array.isArray(complements) ? complements : [],
        sauces: Array.isArray(sauces) ? sauces : [],
        toppings: Array.isArray(toppings) ? toppings : [],
      }),
    });

    if (redemption) {
      const consumed = await Redemption.findOneAndUpdate(
        { _id: redemption._id, status: "active", order: null },
        { status: "used", usedAt: new Date(), usedBy: req.staff.id, order: order._id },
        { new: true }
      );
      if (!consumed) {
        await Order.findByIdAndDelete(order._id);
        return res.status(409).json({ message: "Este premio ya fue usado en otra orden" });
      }
    }

    // Deduct inventory for POS orders (already paid on creation)
    deductInventory(order);

    res.status(201).json({ order });
  } catch (err) {
    res.status(500).json({ message: "Error creating POS order", err: err.message });
  }
};

/* GET /api/staff/analytics — aggregate data for analytics page */
export const getAnalytics = async (req, res) => {
  try {
    // Last 7 days
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);

      const dayOrders = await Order.find({
        createdAt: { $gte: d, $lt: next },
      });

      const rev = dayOrders
        .filter((o) => o.total != null)
        .reduce((s, o) => s + o.total, 0);

      days.push({
        day: d.toLocaleDateString("en-US", { weekday: "short" }),
        orders: dayOrders.length,
        revenue: parseFloat(rev.toFixed(2)),
      });
    }

    // Top proteins (from bowl orders)
    const proteinAgg = await Order.aggregate([
      { $match: { proteins: { $exists: true, $ne: [] } } },
      { $unwind: "$proteins" },
      { $group: { _id: "$proteins", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // Peak hours (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const hourAgg = await Order.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $hour: "$createdAt" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Fill all 24 hours
    const hourMap = {};
    hourAgg.forEach((h) => { hourMap[h._id] = h.count; });
    const peakHours = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: hourMap[h] ?? 0,
    })).filter((h) => h.hour >= 10 && h.hour <= 21); // restaurant hours

    // Top POS items (flat items array)
    const posItemAgg = await Order.aggregate([
      { $match: { source: "pos", items: { $not: { $size: 0 } } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.name", count: { $sum: 1 }, revenue: { $sum: "$items.price" } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    res.json({ days, topProteins: proteinAgg, peakHours, topPosItems: posItemAgg });
  } catch (err) {
    res.status(500).json({ message: "Error fetching analytics", err: err.message });
  }
};

/* GET /api/staff/finance — monthly aggregates (last 6 months) */
export const getFinance = async (req, res) => {
  try {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      d.setHours(0, 0, 0, 0);

      const next = new Date(d);
      next.setMonth(next.getMonth() + 1);

      // YYYY-MM prefix for string-date Expense docs
      const monthPrefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const nextPrefix  = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;

      const [monthOrders, expenses] = await Promise.all([
        Order.find({ createdAt: { $gte: d, $lt: next } }),
        Expense.find({ date: { $gte: monthPrefix + "-01", $lt: nextPrefix + "-01" } }),
      ]);

      const revenue = monthOrders
        .filter((o) => o.total != null)
        .reduce((s, o) => s + o.total, 0);
      const costs = expenses.reduce((s, e) => s + e.amount, 0);

      months.push({
        month: d.toLocaleDateString("en-US", { month: "short" }),
        orders: monthOrders.length,
        revenue: parseFloat(revenue.toFixed(2)),
        costs:   parseFloat(costs.toFixed(2)),
        profit:  parseFloat((revenue - costs).toFixed(2)),
      });
    }

    res.json({ months });
  } catch (err) {
    res.status(500).json({ message: "Error fetching finance", err: err.message });
  }
};
