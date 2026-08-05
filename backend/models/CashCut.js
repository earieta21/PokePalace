import mongoose from "mongoose";

/* Un corte de caja cierra el periodo desde el corte anterior (o desde el
   inicio del día si es el primero) hasta el momento en que se registra.
   `cashSales`/`expectedCash`/`difference` se calculan y congelan en el
   servidor al crearse -- nunca se recalculan después, para que el registro
   sirva como bitácora de auditoría aunque cambien órdenes más adelante. */
const cashCutSchema = new mongoose.Schema(
  {
    employeeId:   { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", required: true },
    employeeName: { type: String, required: true, trim: true },

    from: { type: Date, required: true },
    to:   { type: Date, required: true },

    openingFloat: { type: Number, required: true, min: 0 }, // fondo inicial declarado en este corte
    cashSales:    { type: Number, required: true, min: 0 }, // ventas en efectivo del sistema en el periodo
    expectedCash: { type: Number, required: true },         // openingFloat + cashSales
    countedCash:  { type: Number, required: true, min: 0 }, // efectivo contado a mano
    difference:   { type: Number, required: true },         // countedCash - expectedCash (+sobrante / -faltante)

    notes:      { type: String, trim: true, maxlength: 300, default: "" },
    locationId: { type: String, default: "tij-centro-01" },
  },
  { timestamps: true }
);

cashCutSchema.index({ locationId: 1, to: -1 });

export default mongoose.model("CashCut", cashCutSchema);
