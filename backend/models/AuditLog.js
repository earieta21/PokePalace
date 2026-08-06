import mongoose from "mongoose";

/* Bitácora genérica para cualquier entidad (Inventory, Order, Expense...) --
   string libre en `entity` para que futuras entidades no necesiten migración
   de esquema, solo nuevos sitios de llamada a recordAudit(). Sin TTL: es un
   rastro financiero/operativo, se conserva permanente. */
const auditChangeSchema = new mongoose.Schema(
  {
    field:    { type: String, required: true },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const auditLogSchema = new mongoose.Schema(
  {
    entity:   { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    action:   { type: String, enum: ["create", "update", "delete"], required: true },
    changes:  { type: [auditChangeSchema], default: [] },

    // "system" para cambios sin un humano detrás de ESE campo especifico
    // (reservado para trabajos automáticos futuros); todo lo de esta
    // sub-etapa pasa por requireStaffAuth, así que siempre es "manual".
    actorId:   { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", default: null },
    actorName: { type: String, default: "system" }, // snapshot — sobrevive a rename/baja del empleado
    source:    { type: String, enum: ["manual", "system"], required: true },

    reason:     { type: String, default: "", trim: true, maxlength: 500 },
    locationId: { type: String, default: null },
  },
  { timestamps: true }
);

auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);