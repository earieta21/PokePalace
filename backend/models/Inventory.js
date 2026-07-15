import mongoose from "mongoose";

const orderDeductionSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

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
    // Request IDs make shipment receiving permanently idempotent. Keeping the
    // marker on the same document as qty makes each increment atomic, even
    // when a batch is retried after only some lines reached the server.
    restockRequestIds: { type: [String], default: [], select: false },
    // Permanent per-order ledger. The quantity decrement and insertion of the
    // order id happen in the same document update, making retries safe even
    // when the driver reports an ambiguous network failure.
    deductedOrderIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
      default: [],
      select: false,
    },
    // Exact number of portions removed for an order. deductedOrderIds remains
    // as a compatibility/idempotency marker for records written by older
    // deployments, while this ledger makes qty > 1 reversible without
    // inventing stock when there was only a partial quantity available.
    orderDeductions: {
      type: [orderDeductionSchema],
      default: [],
      select: false,
    },
    // Includes orders processed while qty was already zero. Keeping this
    // separate from deductedOrderIds lets cancellation restore only units that
    // were actually removed while still preventing a later retry from taking
    // newly-restocked inventory for an old sale.
    processedOrderIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
      default: [],
      select: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Inventory", inventorySchema);
