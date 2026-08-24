import User from "../models/User.js";
import Order from "../models/Order.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* GET /api/staff/customers?q=&page=1&limit=25
   Administrative customer directory. Passwords and internal ledgers are
   excluded explicitly so they can never reach the staff browser. */
export const getRegisteredCustomers = async (req, res) => {
  try {
    const query = String(req.query.q || "").trim().slice(0, 80);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
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

    const [total, customers] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select("_id name email phone points lifetimePoints createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const customerIds = customers.map((customer) => customer._id);
    const purchaseStats = customerIds.length > 0
      ? await Order.aggregate([
          {
            $match: {
              user: { $in: customerIds },
              paymentStatus: "paid",
              status: { $ne: "cancelled" },
            },
          },
          {
            $group: {
              _id: "$user",
              purchaseCount: { $sum: 1 },
              totalSpent: { $sum: { $ifNull: ["$total", 0] } },
              lastPurchaseAt: { $max: "$createdAt" },
            },
          },
        ])
      : [];
    const statsByCustomer = new Map(
      purchaseStats.map((stats) => [String(stats._id), stats])
    );
    const customersWithPurchases = customers.map((customer) => {
      const stats = statsByCustomer.get(String(customer._id));
      return {
        ...customer,
        purchaseCount: stats?.purchaseCount || 0,
        totalSpent: stats?.totalSpent || 0,
        lastPurchaseAt: stats?.lastPurchaseAt || null,
      };
    });

    return res.json({
      customers: customersWithPurchases,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error("getRegisteredCustomers error:", err.message);
    return res.status(500).json({
      message: "No se pudo cargar la lista de clientes",
    });
  }
};
