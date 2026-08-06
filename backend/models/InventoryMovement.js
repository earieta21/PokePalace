import mongoose from "mongoose";

/* Ledger de cantidad de inventario, separado de AuditLog a propósito: cada
   venta pagada escribe una fila por artículo afectado, así que en volumen va
   a superar por mucho cualquier otro evento de auditoría -- mezclarlo con la
   bitácora genérica haría lento/ruidoso el browser de auditoría de otras
   entidades, y qtyBefore/qtyAfter/delta como campos tipados de primera clase
   evitan que cada reporte tenga que restar valores desde un array genérico.

   Inventory.qty sigue siendo la única fuente de verdad del stock actual --
   este ledger es un registro de lo que pasó, nunca algo que se consulte para
   saber cuánto hay ahorita. */
export const INVENTORY_MOVEMENT_TYPES = [
  "restock", "restock_batch", "sale_deduction", "sale_reversal",
  "manual_adjustment",
  "waste",            // reservado -- se conecta cuando se ligue la merma a inventario
  "count_adjustment", // reservado -- se conecta con los conteos físicos
];

const inventoryMovementSchema = new mongoose.Schema(
  {
    itemId:   { type: mongoose.Schema.Types.ObjectId, ref: "Inventory", required: true },
    itemName: { type: String, required: true }, // snapshot -- sobrevive a que renombren/borren el artículo
    type:     { type: String, enum: INVENTORY_MOVEMENT_TYPES, required: true },

    delta:     { type: Number, required: true }, // firmado: qtyAfter - qtyBefore
    qtyBefore: { type: Number, required: true, min: 0 },
    qtyAfter:  { type: Number, required: true, min: 0 },

    actorId:   { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", default: null },
    actorName: { type: String, default: "system" },

    reference:     { type: String, default: null }, // orderId / restockRequestId / futuro wasteLogId / countId
    referenceType: { type: String, enum: ["order", "restockRequest", "manual", "waste", "count"], default: "manual" },

    reason:     { type: String, default: "", trim: true, maxlength: 500 },
    locationId: { type: String, default: null },

    // Protege contra reintentos (pago/cancelación/lote) que dupliquen la
    // fila del ledger aunque la mutación de qty ya sea idempotente por su
    // cuenta. Opcional -- ajustes manuales sin token de reintento no la usan.
    idempotencyKey: { type: String, default: null },
  },
  { timestamps: true }
);

inventoryMovementSchema.index({ itemId: 1, createdAt: -1 });
inventoryMovementSchema.index({ type: 1, createdAt: -1 });
inventoryMovementSchema.index(
  { itemId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

export default mongoose.model("InventoryMovement", inventoryMovementSchema);