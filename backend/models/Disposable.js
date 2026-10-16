import mongoose from "mongoose";
import { DISPOSABLE_CATEGORIES } from "../utils/disposables.js";

// Desechables contados por paquete/pieza, sin precio (ver utils/disposables.js).
// `pieces` es la única fuente de verdad de la existencia; paquetes + sueltas
// se calculan al mostrar con piecesPerPack.
const disposableSchema = new mongoose.Schema(
  {
    name:          { type: String, required: true, trim: true, maxlength: 80 },
    category:      { type: String, enum: DISPOSABLE_CATEGORIES, default: "Otro" },
    piecesPerPack: { type: Number, required: true, min: 1 },
    pieces:        { type: Number, required: true, min: 0, default: 0 },
    minPacks:      { type: Number, min: 0, default: 0 },
    lastCountAt:   { type: Date, default: null },
    lastCountBy:   { type: String, default: null },
    // Folios de operaciones ya aplicadas: reintentar una recepción/salida por
    // un corte de red no la duplica (mismo patrón que Inventory).
    requestIds:    { type: [String], default: [], select: false },
  },
  { timestamps: true }
);

export default mongoose.model("Disposable", disposableSchema);
