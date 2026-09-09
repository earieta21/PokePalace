import mongoose from "mongoose";

// Una sesión por chat de Telegram. `authorized` se pone en true la primera
// vez que el chat manda el código de acceso correcto (TELEGRAM_FINANCE_ACCESS_CODE)
// -- así no hay que ir a buscar IDs numéricos de Telegram para dar de alta a
// alguien del staff, solo compartirles el código una vez.
const financeBotSessionSchema = new mongoose.Schema(
  {
    chatId: { type: String, required: true, trim: true },
    authorized: { type: Boolean, default: false },
    telegramUsername: { type: String, default: null, trim: true },
    telegramName: { type: String, default: null, trim: true },

    // Foto ya subida a Cloudinary, esperando la descripción del usuario (o
    // una aclaración tras un intento de lectura con poca confianza) antes de
    // registrar el gasto.
    pendingReceipt: {
      cloudinaryUrl: { type: String, default: null },
      notes: { type: [String], default: [] }, // respuestas de texto acumuladas
      attempts: { type: Number, default: 0 },
    },

    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

financeBotSessionSchema.index({ chatId: 1 }, { unique: true });
// Sesiones inactivas se auto-borran tras 48h -- si alguien manda una foto y
// nunca contesta la pregunta, no se queda "esperando" para siempre.
financeBotSessionSchema.index({ lastActivityAt: 1 }, { expireAfterSeconds: 60 * 60 * 48 });

export default mongoose.model("FinanceBotSession", financeBotSessionSchema);
