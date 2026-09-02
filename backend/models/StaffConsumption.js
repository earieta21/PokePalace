import mongoose from "mongoose";

const staffConsumptionSchema = new mongoose.Schema(
  {
    staffId:   { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", required: true },
    staffName: { type: String, required: true, trim: true },
    staffRole: { type: String, required: true },

    dateKey:   { type: String, required: true },
    locationId:{ type: String, default: null },
    meal:      { type: String, default: "Bowl del personal", trim: true, maxlength: 120 },

    proteinItemId: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory", required: true },
    proteinName:   { type: String, required: true, trim: true },
    proteinGrams:  { type: Number, required: true, min: 0 },
    inventoryQty:  { type: Number, required: true, min: 0 },
    inventoryUnit: { type: String, required: true },
    unitCost:       { type: Number, default: 0, min: 0 },
    proteinCost:    { type: Number, default: 0, min: 0 },

    note: { type: String, default: "", trim: true, maxlength: 300 },
    registeredById:   { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", required: true },
    registeredByName: { type: String, required: true },

    status: { type: String, enum: ["pending", "recorded", "void"], default: "pending" },
    voidedAt: { type: Date, default: null },
    voidedById: { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", default: null },
    voidedByName: { type: String, default: null },

    // El cliente conserva este id al reintentar: evita descontar dos veces si
    // la red se corta después de que el servidor ya guardó el registro.
    clientRequestId: { type: String, required: true, unique: true },
    // Solo se llena para la prestación diaria del personal. Los dueños quedan
    // sin llave para poder registrar su consumo real más de una vez si ocurre.
    activePolicyKey: { type: String, default: null },
  },
  { timestamps: true }
);

staffConsumptionSchema.index({ dateKey: 1, createdAt: -1 });
staffConsumptionSchema.index({ staffId: 1, dateKey: -1 });
staffConsumptionSchema.index(
  { activePolicyKey: 1 },
  { unique: true, partialFilterExpression: { activePolicyKey: { $type: "string" } } }
);

export default mongoose.model("StaffConsumption", staffConsumptionSchema);
