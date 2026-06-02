import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    // Customer-side orders: user is set. POS orders: staffId is set.
    user:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser" },

    // Bowl-builder fields (customer orders)
    base:        { type: String, default: null },
    protein:     { type: String, default: null },
    marinades:   { type: [String], default: [] },
    complements: { type: [String], default: [] },
    sauces:      { type: [String], default: [] },
    toppings:    { type: [String], default: [] },

    // POS orders: flat item list [{name, price, qty}]
    items: { type: Array, default: [] },

    // Shared optional fields
    customer: { type: String, default: null }, // "Table 4", "Walk-in", customer name
    source:   { type: String, enum: ["online", "pos"], default: "online" },
    total:    { type: Number, default: null },  // in dollars

    status: {
      type: String,
      enum: ["pending", "preparing", "ready", "completed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);
