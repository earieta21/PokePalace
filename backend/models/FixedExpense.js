import mongoose from "mongoose";
import { EXPENSE_CATEGORIES } from "./Expense.js";

/* Gasto recurrente de monto fijo (renta, luz, internet...). No es un gasto en
   sí: es la plantilla que el servidor usa para anotar solo el gasto real en
   Finanzas una vez al mes (ver utils/fixedExpenses.js).

   La nómina NO vive aquí a propósito: su monto cambia cada semana según las
   horas checadas, así que se calcula y se confirma aparte (utils/payroll.js). */
const fixedExpenseSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, enum: EXPENSE_CATEGORIES },
    amount:   { type: Number, required: true, min: 0 },
    // Día del mes en que se anota. Si el mes es más corto (día 31 en
    // febrero), se usa el último día del mes.
    dayOfMonth: { type: Number, required: true, min: 1, max: 31 },
    active:     { type: Boolean, default: true },
    locationId: { type: String, default: "tij-centro-01" },
    createdBy:  { type: String, default: "staff" },
  },
  { timestamps: true }
);

export default mongoose.model("FixedExpense", fixedExpenseSchema);
