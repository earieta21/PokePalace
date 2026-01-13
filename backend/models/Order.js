import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    base: { type: String, default: null },
    protein: { type: String, default: null },
    marinades: { type: [String], default: [] },
    complements: { type: [String], default: [] },
    sauces: { type: [String], default: [] },
    toppings: { type: [String], default: [] },

    status: {
      type: String,
      enum: ["pending", "preparing", "ready", "completed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);
