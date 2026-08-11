import User from "../models/User.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /api/staff/customers?q=&page=1&limit=25
// Administrative customer directory. Only the fields required by the staff
// screen are selected; passwords and internal ledgers never leave the API.
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

    return res.json({
      customers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error("getRegisteredCustomers error:", err.message);
    return res.status(500).json({ message: "No se pudo cargar la lista de clientes" });
  }
};
