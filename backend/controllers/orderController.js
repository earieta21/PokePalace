import Order from "../models/Order.js";

export const createOrder = async (req, res) => {
  try {
    const { base, protein, marinades, complements, sauces, toppings } = req.body;

    const order = await Order.create({
      user: req.userId,
      base,
      protein,
      marinades: Array.isArray(marinades) ? marinades : [],
      complements: Array.isArray(complements) ? complements : [],
      sauces: Array.isArray(sauces) ? sauces : [],
      toppings: Array.isArray(toppings) ? toppings : [],
    });

    res.status(201).json({ order });
  } catch (err) {
    res.status(500).json({ msg: "Error creando la orden" });
  }
};

export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(30);

    res.json({ orders });
  } catch (err) {
    res.status(500).json({ msg: "Error obteniendo órdenes" });
  }
};
