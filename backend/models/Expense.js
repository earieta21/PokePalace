import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: String, required: true,
      enum: ["Ingredientes", "Limpieza", "Renta", "Servicios", "Nómina", "Empaque", "Marketing", "Mantenimiento", "Otros"],
    },
    description: { type: String, required: true, trim: true },
    amount:      { type: Number, required: true, min: 0 },
    date:        { type: String, required: true }, // YYYY-MM-DD
    locationId:  { type: String, default: "tij-centro-01" },
    createdBy:   { type: String, default: "staff" },
    source:      { type: String, enum: ["manual", "inventario"], default: "manual" },
  },
  { timestamps: true }
);

export default mongoose.model("Expense", expenseSchema);
