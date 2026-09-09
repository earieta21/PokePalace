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
    // "telegram": factura mandada por foto al bot de Finanzas, leída por el agente.
    source:      { type: String, enum: ["manual", "inventario", "fijo", "nomina", "telegram"], default: "manual" },
    // Sparse so existing/manual expenses remain unchanged; inventory
    // receptions use it to avoid creating the same expense twice on retry.
    sourceRef:   { type: String, unique: true, sparse: true, trim: true },
    // Foto de la factura/ticket en Cloudinary (source: "telegram") — el
    // comprobante que respalda el gasto para el contador.
    receiptUrl:  { type: String, default: null },
    // Si esta compra tiene CFDI (factura fiscal válida, con RFC) — es lo
    // único que decide si el IVA de este gasto se puede acreditar contra el
    // IVA cobrado, sin importar si se pagó en efectivo o con tarjeta (ver
    // services/fiscalCalc.js). facturaIva es el IVA de ESA factura tal cual
    // viene desglosado, nunca se asume un % — evita adivinar tasas (hay
    // insumos de restaurante exentos o a tasa distinta de 16%).
    hasFactura:  { type: Boolean, default: false },
    facturaIva:  { type: Number, default: null, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Expense", expenseSchema);
