import Order from "../models/Order.js";

const hasRequiredBowlFields = ({ base, protein }) => {
  return Boolean(base && protein);
};

export const createOrder = async (req, res) => {
  try {
    const { base, protein, marinades, complements, sauces, toppings } = req.body;

    if (!hasRequiredBowlFields({ base, protein })) {
      return res.status(400).json({ msg: "Selecciona base y proteína antes de confirmar" });
    }

    const order = await Order.create({
      user: req.userId || null,
      base,
      protein,
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
