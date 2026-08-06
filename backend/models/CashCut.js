import mongoose from "mongoose";

/* Cierre de caja -- ciclo de vida diario (Fase 1 del plan de 90 días de Eric).
   Un documento por sucursal+fecha (índice único parcial sobre `date`, que
   solo existe en los cierres creados por este flujo). Los cortes de turno
   creados ANTES de esta función (varios por día, encadenados desde el `to`
   del anterior) se conservan tal cual como historial -- tienen `date` y
   `status` ausentes (null), y el índice único parcial los ignora a propósito
   para no romper nada de lo ya guardado.

   Flujo nuevo: abrir (status:"open", solo se conoce el fondo inicial) ->
   capturar retiros/devoluciones/tarjeta/en línea durante el día -> cerrar
   (status:"closed", se calculan y congelan ventas/diferencias) -> solo
   owner/admin puede reabrir (motivo obligatorio, queda en AuditLog). */
const cashCutSchema = new mongoose.Schema(
  {
    employeeId:   { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", required: true },
    employeeName: { type: String, required: true, trim: true },

    locationId: { type: String, default: "tij-centro-01" },
    // YYYY-MM-DD en hora Tijuana. Ausente (null) = corte de turno legado.
    date:   { type: String, default: null },
    status: { type: String, enum: ["open", "closed"], default: null },

    from: { type: Date, required: true },
    to:   { type: Date, default: null }, // se fija al cerrar

    openingFloat: { type: Number, required: true, min: 0 }, // fondo inicial
    withdrawals:  { type: Number, default: 0, min: 0 },     // retiros de caja
    returns:      { type: Number, default: 0, min: 0 },     // devoluciones en efectivo
    commissions:  { type: Number, default: 0, min: 0 },     // comisiones estimadas del día

    // Efectivo -- se calculan y congelan al cerrar.
    cashSales:    { type: Number, default: 0, min: 0 },
    expectedCash: { type: Number, default: null },
    countedCash:  { type: Number, default: null, min: 0 },
    difference:   { type: Number, default: null },
    percentDifference:     { type: Number, default: null },
    differenceExplanation: { type: String, default: "", trim: true, maxlength: 500 },

    // Tarjeta -- ventas esperadas del sistema vs. lo que reportó la terminal.
    cardSalesExpected: { type: Number, default: 0 },
    cardTerminalTotal: { type: Number, default: null },
    cardDifference:    { type: Number, default: null },

    // En línea -- ventas esperadas del sistema vs. lo depositado/reportado.
    onlineSalesExpected: { type: Number, default: 0 },
    onlineTotalReported: { type: Number, default: null },
    onlineDifference:    { type: Number, default: null },

    reopenedAt:   { type: Date, default: null },
    reopenReason: { type: String, default: "", trim: true, maxlength: 500 },
    reopenedBy:   { type: String, default: null },

    notes: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true }
);

cashCutSchema.index({ locationId: 1, to: -1 });
cashCutSchema.index(
  { locationId: 1, date: 1 },
  { unique: true, partialFilterExpression: { date: { $type: "string" } } }
);

export default mongoose.model("CashCut", cashCutSchema);