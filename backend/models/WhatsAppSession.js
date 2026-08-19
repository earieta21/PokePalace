import mongoose from "mongoose";

// Una sesión por número de teléfono — mantiene el carrito (fuente de verdad,
// siempre recalculado contra POS_CATALOG) y un historial corto de texto plano
// para darle contexto a Claude. Los bloques tool_use/tool_result del loop del
// agente viven solo en memoria durante un webhook; aquí solo se guarda el
// resumen legible de cada turno.
const whatsAppSessionSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, trim: true },

    messages: {
      type: [
        {
          role: { type: String, enum: ["user", "assistant"], required: true },
          text: { type: String, required: true, maxlength: 2000 },
        },
      ],
      default: [],
    },

    cart: {
      type: [
        {
          catalogId: { type: String, required: true },
          name:      { type: String, required: true },
          price:     { type: Number, required: true },
          qty:       { type: Number, required: true },
        },
      ],
      default: [],
    },

    customerName: { type: String, default: null, trim: true, maxlength: 80 },

    // Se incrementa cada vez que se intenta confirmar un pedido — junto con
    // el _id de la sesión forma un clientOrderId estable para que un
    // reintento del mismo intento nunca duplique la orden.
    orderSeq: { type: Number, default: 0 },
    lastOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },

    // Últimos wamid procesados — Meta reintenta la entrega del webhook si no
    // hay ack rápido; esto evita reprocesar el mismo mensaje dos veces.
    processedMessageIds: { type: [String], default: [] },

    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

whatsAppSessionSchema.index({ phone: 1 }, { unique: true });
// Sesiones inactivas se auto-borran — cada actualización de lastActivityAt
// recorre la ventana, así que solo expira tras inactividad real.
whatsAppSessionSchema.index({ lastActivityAt: 1 }, { expireAfterSeconds: 60 * 60 * 12 });

export default mongoose.model("WhatsAppSession", whatsAppSessionSchema);
