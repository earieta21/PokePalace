import mongoose from "mongoose";

export const EXPENSE_CATEGORIES = [
  "Ingredientes", "Bebidas", "Limpieza", "Renta", "Servicios",
  "Nómina", "Empaque", "Marketing", "Mantenimiento", "Otros",
];

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: String, required: true,
      enum: EXPENSE_CATEGORIES,
    },
    description: { type: String, required: true, trim: true },
    amount:      { type: Number, required: true, min: 0 },
    date:        { type: String, required: true }, // YYYY-MM-DD
    locationId:  { type: String, default: "tij-centro-01" },
    createdBy:   { type: String, default: "staff" },
    // "fijo": gasto recurrente que se anota solo cada mes (ver FixedExpense).
    // "nomina": la nómina de una semana ya cerrada, registrada desde Finanzas.
    source:      { type: String, enum: ["manual", "inventario", "fijo", "nomina"], default: "manual" },
    // Sparse so existing/manual expenses remain unchanged; inventory
    // receptions use it to avoid creating the same expense twice on retry.
    sourceRef:   { type: String, unique: true, sparse: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("Expense", expenseSchema);
