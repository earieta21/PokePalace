import mongoose from "mongoose";

// Bitácora de cambios de existencia de desechables, en piezas.
const disposableMovementSchema = new mongoose.Schema(
  {
    disposableId: { type: mongoose.Schema.Types.ObjectId, ref: "Disposable", required: true },
    name:         { type: String, required: true }, // snapshot
    type:         { type: String, enum: ["create", "receive", "count", "use"], required: true },
    delta:        { type: Number, required: true },
    piecesBefore: { type: Number, required: true, min: 0 },
    piecesAfter:  { type: Number, required: true, min: 0 },
    actorId:      { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", default: null },
    actorName:    { type: String, default: "staff" },
    note:         { type: String, default: "", trim: true, maxlength: 200 },
  },
  { timestamps: true }
);

disposableMovementSchema.index({ disposableId: 1, createdAt: -1 });

export default mongoose.model("DisposableMovement", disposableMovementSchema);
