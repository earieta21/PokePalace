import mongoose from "mongoose";

/* Comprobante (foto de factura, ticket o voucher) para el contador.
   Se sube desde la pestaña Comprobantes del portal (o llega por el bot de
   Telegram de Finanzas) y cada lunes se manda por correo todo lo que no se
   haya enviado todavía -- ver utils/accountantReport.js. */

// factura: CFDI de una compra · ticket: nota/ticket sin CFDI ·
// voucher: comprobante de la terminal (cierre de lote, ventas con tarjeta).
export const RECEIPT_KINDS = ["factura", "ticket", "voucher", "otro"];
// Mismas formas de pago que separa el corte de caja.
export const RECEIPT_PAYMENT_METHODS = ["efectivo", "tarjeta", "transferencia", "otro"];

const receiptSchema = new mongoose.Schema(
  {
    kind:          { type: String, enum: RECEIPT_KINDS, default: "ticket" },
    paymentMethod: { type: String, enum: [...RECEIPT_PAYMENT_METHODS, null], default: null },
    // Opcional: la foto es el documento que vale; el monto solo sirve para
    // que el resumen del correo cuadre por forma de pago.
    amount:        { type: Number, default: null, min: 0 },
    date:          { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // fecha del documento
    vendor:        { type: String, trim: true, maxlength: 120, default: "" },
    note:          { type: String, trim: true, maxlength: 300, default: "" },
    imageUrl:      { type: String, required: true },
    documents: { type: [{
      url: { type: String, required: true },
      publicId: { type: String, required: true },
      mimeType: { type: String, required: true },
      resourceType: { type: String, enum: ["image", "raw"], required: true },
      name: { type: String, required: true },
    }], default: [] },
    // Solo las fotos subidas desde el portal se pueden borrar de Cloudinary;
    // las de Telegram las comparte el gasto que creó el bot.
    publicId:      { type: String, default: null },
    source:        { type: String, enum: ["portal", "telegram"], default: "portal" },
    locationId:    { type: String, default: "tij-centro-01" },
    uploadedBy:    { type: String, default: "staff" },
    // Gasto de Finanzas que se creó junto con este comprobante (si se pidió).
    expenseId:     { type: mongoose.Schema.Types.ObjectId, ref: "Expense", default: null },
    expenseMode:   { type: String, enum: ["created", "existing", null], default: null },
    revision:      { type: Number, default: 0 },
    // A claim prevents an edit/delete from changing a document being emailed.
    processing:    { type: String, default: null },
    // null = pendiente; se llena cuando el correo al contador salió bien.
    sentToAccountantAt: { type: Date, default: null },
  },
  { timestamps: true }
);

receiptSchema.index({ sentToAccountantAt: 1, createdAt: 1 });
receiptSchema.index({ date: -1, createdAt: -1 });

export default mongoose.model("Receipt", receiptSchema);
