import mongoose from "mongoose";

const inventorySchema = new mongoose.Schema(
  {
    item:     { type: String, required: true },
    section:  { type: String, default: "Comida" },
    category: { type: String, default: "Other" },
    unit:     { type: String, required: true },
    qty:      { type: Number, required: true, min: 0 },
    minQty:   { type: Number, default: 0 },
    cost:     { type: Number, default: 0 },
    supplier: { type: String, default: "" },
    menuKeys: { type: [String], default: [] }, // e.g. ["salmon","citrus_marinade"] — matched on order pay
    lastRestockAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Inventory", inventorySchema);
