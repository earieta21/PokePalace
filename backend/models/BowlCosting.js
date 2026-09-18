import mongoose from "mongoose";

// Un solo documento de configuración (siempre el mismo _id) con lo que cuesta
// cada parte de un bowl. Lo que se puede sacar del inventario (proteína por kg)
// NO se guarda aquí — se lee en vivo para que el costeo no quede desactualizado
// cuando cambia el precio del proveedor. Aquí solo vive lo que el inventario
// todavía no puede responder: rendimiento por porción y empaque.
const partSchema = new mongoose.Schema(
  {
    costPerUnit: { type: Number, default: 0, min: 0 },
    unitsPerBowl: { type: Number, default: 1, min: 0 },
  },
  { _id: false }
);

const bowlCostingSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "bowl-costing" },

    base: { type: partSchema, default: () => ({ costPerUnit: 0, unitsPerBowl: 1 }) },
    marinades: { type: partSchema, default: () => ({ costPerUnit: 0, unitsPerBowl: 1 }) },
    complements: { type: partSchema, default: () => ({ costPerUnit: 0, unitsPerBowl: 4 }) },
    sauces: { type: partSchema, default: () => ({ costPerUnit: 0, unitsPerBowl: 1 }) },
    toppings: { type: partSchema, default: () => ({ costPerUnit: 0, unitsPerBowl: 2 }) },
    packaging: { type: partSchema, default: () => ({ costPerUnit: 0, unitsPerBowl: 1 }) },

    // Costo por kg de cada proteína cuando el inventario no lo puede dar solo
    // (p. ej. Tofu se lleva por pieza, no por kg). { tofu: 120 }
    proteinCostPerKgOverride: { type: Map, of: Number, default: {} },

    // Para costear el Combo Palace completo contra su precio de venta.
    comboDrinkCost: { type: Number, default: 0, min: 0 },
    comboRiceCakeCost: { type: Number, default: 0, min: 0 },

    // Reglas de decisión del negocio (las del documento de estrategia).
    promoMinMarginPct: { type: Number, default: 25, min: 0, max: 100 },
    promoEligibleMinMarginPct: { type: Number, default: 40, min: 0, max: 100 },

    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.BowlCosting
  || mongoose.model("BowlCosting", bowlCostingSchema);
