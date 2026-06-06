import Order from "../models/Order.js";

const hasRequiredBowlFields = ({ base, proteins }) => {
  return Boolean(base && Array.isArray(proteins) && proteins.length >= 2);
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

    const order = await Order.create({
      user: req.userId || null,
      customer: customer.trim(),
      phone: phone.trim(),
      notes: notes?.trim() || null,
      fulfillment: fulfillment || "pickup",
      paymentMethod: paymentMethod || "pay_at_pickup",
      paymentStatus: paymentMethod === "online" ? "pending" : "pending",
      source: "online",
      base,
      protein: selectedProteins.join(", "),
      proteins: selectedProteins,
      bowlSize: bowlSize || (selectedProteins.length === 3 ? "large" : "normal"),
      proteinUpcharge: selectedProteins.length === 3 ? 1 : 0,
      marinades: Array.isArray(marinades) ? marinades : [],
      complements: Array.isArray(complements) ? complements : [],
      sauces: Array.isArray(sauces) ? sauces : [],
      toppings: Array.isArray(toppings) ? toppings : [],
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
