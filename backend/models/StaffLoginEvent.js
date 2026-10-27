import mongoose from "mongoose";

/* Bitácora de accesos al portal del staff: entradas, PIN fallidos, bloqueos,
   cambios de PIN y Face ID activados. Va aparte de AuditLog porque un intento
   fallido no tiene empleado ni documento asociado, y aquí sí conviene que
   caduque sola (180 días) en vez de crecer para siempre.

   También es la fuente del bloqueo por sucursal (utils/staffLoginGuard.js):
   al vivir en Mongo, sobrevive a los reinicios del servidor. */
const staffLoginEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["success", "failed", "locked", "upgrade_required", "pin_changed", "passkey_registered"],
      required: true,
    },
    method:     { type: String, enum: ["pin", "passkey"], required: true },
    locationId: { type: String, default: null },
    staffId:    { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", default: null },
    staffName:  { type: String, default: "" }, // snapshot — sobrevive a rename/baja
    ip:         { type: String, default: "" },
    userAgent:  { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

staffLoginEventSchema.index({ locationId: 1, method: 1, type: 1, createdAt: -1 });
staffLoginEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export default mongoose.model("StaffLoginEvent", staffLoginEventSchema);
