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
    lastRestockBy: { type: String, default: null }, // nombre del staff que hizo la última recepción

    // Fase 2 (recetas y costo completo) -- cuánto representa "1 porción" de
    // este artículo, en la misma unidad que `unit`. null = todavía no
    // capturado (no se inventa un valor "razonable"; el semáforo de Costo
    // del menú lo marca en amarillo/rojo hasta que alguien lo llene).
    portionQty: { type: Number, default: null, min: 0 },
    // % del artículo comprado que en realidad se aprovecha (mermas de
    // limpieza/corte). 100 = todo se usa. null = sin capturar.
    yieldPct:   { type: Number, default: null, min: 0, max: 100 },
    // Informativos, para mostrar la conversión compra→uso en Costo del
    // menú -- no cambian cómo se registra `qty` en la recepción (eso
    // sigue siempre en `unit`, sin tocar el flujo ya probado).
    purchaseUnit:             { type: String, default: null },
    purchaseConversionFactor: { type: Number, default: null, min: 0 }, // cuántas `unit` hay en 1 `purchaseUnit`
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
