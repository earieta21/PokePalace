import mongoose from "mongoose";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Redemption from "../models/Redemption.js";
import { GOLD_TIER_MIN_POINTS } from "../utils/loyalty.js";
import {
  CUSTOMER_SEGMENTS,
  CUSTOMER_SORTS,
  FREQUENT_WINDOW_DAYS,
  SEGMENT_THRESHOLDS,
  buildCustomerDirectory,
  customerFlags,
  maskRewardCode,
  pointsExpiryDate,
  summarizeCustomerOrders,
} from "../utils/customerSegments.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Una compra cuenta si se pagó y no se canceló (mismo criterio en la lista y
// en la ficha).
const PURCHASE_MATCH = { paymentStatus: "paid", status: { $ne: "cancelled" } };

const purchaseStatsGroup = (recentCutoff) => ({
  purchaseCount: { $sum: 1 },
  totalSpent: { $sum: { $ifNull: ["$total", 0] } },
  firstPurchaseAt: { $min: "$createdAt" },
  lastPurchaseAt: { $max: "$createdAt" },
  recentPurchaseCount: { $sum: { $cond: [{ $gte: ["$createdAt", recentCutoff] }, 1, 0] } },
});

const recentCutoffFrom = (now) => new Date(now.getTime() - FREQUENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

// GET /api/staff/customers?q=&segment=all&sort=recent&page=1&limit=25
// Administrative customer directory. Only the fields required by the staff
// screen are selected; passwords and internal ledgers never leave the API.
// Los segmentos dependen de las compras de cada cliente, así que se calculan
// sobre todos los que coinciden con la búsqueda y luego se pagina — sobra
// para el tamaño de un restaurante (miles de cuentas, no millones).
export const getRegisteredCustomers = async (req, res) => {
  try {
    const query = String(req.query.q || "").trim().slice(0, 80);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const segment = CUSTOMER_SEGMENTS.includes(req.query.segment) ? req.query.segment : "all";
    const sort = CUSTOMER_SORTS.includes(req.query.sort) ? req.query.sort : "recent";
    const filter = { role: "user" };

    if (query) {
      const safeQuery = escapeRegex(query);
      const digits = query.replace(/\D/g, "");
      filter.$or = [
        { name: { $regex: safeQuery, $options: "i" } },
        { email: { $regex: safeQuery, $options: "i" } },
        ...(digits.length >= 3
          ? [{ phone: { $regex: digits.split("").join("\\D*"), $options: "i" } }]
          : []),
      ];
    }

    const customers = await User.find(filter)
      .select("_id name email phone points lifetimePoints pointsLastEarnedAt createdAt")
      .lean();

    const now = new Date();
    const purchaseStats = customers.length > 0
      ? await Order.aggregate([
          {
            $match: {
              ...PURCHASE_MATCH,
              user: query ? { $in: customers.map((customer) => customer._id) } : { $type: "objectId" },
            },
          },
          { $group: { _id: "$user", ...purchaseStatsGroup(recentCutoffFrom(now)) } },
        ])
      : [];
    const statsByCustomer = new Map(purchaseStats.map((stats) => [String(stats._id), stats]));

    const { counts, rows } = buildCustomerDirectory(customers, statsByCustomer, { segment, sort, now });
    const total = rows.length;

    return res.json({
      customers: rows.slice((page - 1) * limit, page * limit),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
      segment,
      sort,
      segments: counts,
      thresholds: SEGMENT_THRESHOLDS,
    });
  } catch (err) {
    console.error("getRegisteredCustomers error:", err.message);
    return res.status(500).json({ message: "No se pudo cargar la lista de clientes" });
  }
};

const ORDER_DETAIL_FIELDS = [
  "createdAt", "source", "status", "paymentStatus", "paymentMethod", "fulfillment",
  "deliveryPlatform", "total", "items", "cartItems", "base", "bases", "proteins",
  "bowlSize", "marinades", "complements", "sauces", "toppings", "extraScoopProteins",
  "loyaltyPointsEarned", "pointsRedeemed", "rewardCode",
].join(" ");

// GET /api/staff/customers/:id — ficha del cliente: compras, puntos, lo que
// más pide, últimos pedidos y premios.
export const getCustomerDetail = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }
    const customer = await User.findOne({ _id: req.params.id, role: "user" })
      .select("_id name email phone points lifetimePoints pointsLastEarnedAt createdAt favoriteBowls")
      .lean();
    if (!customer) return res.status(404).json({ message: "Cliente no encontrado" });

    const now = new Date();
    const purchases = { user: customer._id, ...PURCHASE_MATCH };
    const [statsRows, recentOrders, paidOrders, redemptions] = await Promise.all([
      Order.aggregate([
        { $match: purchases },
        { $group: { _id: null, ...purchaseStatsGroup(recentCutoffFrom(now)) } },
      ]),
      Order.find({ user: customer._id })
        .sort({ createdAt: -1 })
        .limit(15)
        .select(ORDER_DETAIL_FIELDS)
        .lean(),
      Order.find(purchases)
        .sort({ createdAt: -1 })
        .limit(100)
        .select("source items cartItems base proteins")
        .lean(),
      Redemption.find({ user: customer._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("rewardName pointsCost status code expiresAt usedAt createdAt source")
        .lean(),
    ]);

    const stats = statsRows[0] || null;
    const flags = customerFlags(customer, stats, now);
    const purchaseCount = stats?.purchaseCount || 0;
    const totalSpent = stats?.totalSpent || 0;

    return res.json({
      customer: {
        _id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone || "",
        points: customer.points || 0,
        lifetimePoints: customer.lifetimePoints || 0,
        createdAt: customer.createdAt,
        favoriteBowls: (customer.favoriteBowls || []).map((bowl) => ({
          name: bowl.name,
          proteins: bowl.proteins || [],
        })),
      },
      tags: Object.keys(flags).filter((key) => flags[key]),
      stats: {
        purchaseCount,
        totalSpent,
        avgTicket: purchaseCount > 0 ? Math.round((totalSpent / purchaseCount) * 100) / 100 : 0,
        firstPurchaseAt: stats?.firstPurchaseAt || null,
        lastPurchaseAt: stats?.lastPurchaseAt || null,
        recentPurchaseCount: stats?.recentPurchaseCount || 0,
      },
      loyalty: {
        isGold: flags.gold,
        goldMinPoints: GOLD_TIER_MIN_POINTS,
        pointsToGold: Math.max(0, GOLD_TIER_MIN_POINTS - (customer.lifetimePoints || 0)),
        pointsExpireAt: pointsExpiryDate(customer),
        expiringSoon: flags.expiring,
      },
      favorites: summarizeCustomerOrders(paidOrders),
      orders: recentOrders,
      redemptions: redemptions.map(({ code, ...redemption }) => ({ ...redemption, code: maskRewardCode(code) })),
      thresholds: SEGMENT_THRESHOLDS,
    });
  } catch (err) {
    console.error("getCustomerDetail error:", err.message);
    return res.status(500).json({ message: "No se pudo cargar la ficha del cliente" });
  }
};
