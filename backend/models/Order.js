import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    // Customer-side orders: user is set. POS orders: staffId is set.
    user:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser" },

    // Bowl-builder fields (customer orders)
    base:        { type: String, default: null },
    protein:     { type: String, default: null },
    proteins:    { type: [String], default: [] },
    bowlSize:    { type: String, enum: ["normal", "large"], default: "normal" },
    proteinUpcharge: { type: Number, default: 0 },
    marinades:   { type: [String], default: [] },
    complements: { type: [String], default: [] },
    sauces:      { type: [String], default: [] },
    toppings:    { type: [String], default: [] },

    // POS orders: flat item list [{name, price, qty}]
    items: { type: Array, default: [] },

    // Shared optional fields
    customer: { type: String, default: null }, // "Table 4", "Walk-in", customer name
    phone:    { type: String, default: null },
    notes:    { type: String, default: null },
    fulfillment: {
      type: String,
      enum: ["pickup", "dine_in", "delivery"],
      default: "pickup",
    },
    paymentMethod: {
      type: String,
      enum: ["pay_at_pickup", "cash", "card_terminal", "online"],
      default: "pay_at_pickup",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    source:   { type: String, enum: ["online", "pos"], default: "online" },
    total:    { type: Number, default: null },  // in dollars

    // Pricing — always computed server-side, never trusted from the client
    subtotal: { type: Number, default: null },
    tax:      { type: Number, default: null },

    // Promo codes
    promoCode:      { type: String, default: null },
    discountAmount: { type: Number, default: 0 },

    // Scheduled pickup
    scheduledPickupTime: { type: Date, default: null },
    isScheduled:         { type: Boolean, default: false },

    status: {
      type: String,
      enum: ["pending", "preparing", "ready", "completed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);
