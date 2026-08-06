import mongoose from "mongoose";

/* Receta versionada por catalogId (Fase 2 del plan de 90 días). Editar una
   receta NUNCA muta el documento existente -- crea una versión nueva y
   desactiva la anterior, para que un pedido pagado con una versión vieja
   conserve su snapshot de costo real aunque la receta cambie después. */
const recipeIngredientSchema = new mongoose.Schema(
  {
    // Mismo id que ya usan inventoryRecipe/menuKeys (ej. "salmon") -- se
    // resuelve contra Inventory.menuKeys, no duplica esa relación.
    key:      { type: String, required: true, trim: true },
    portions: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const packagingLineSchema = new mongoose.Schema(
  {
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory", default: null },
    description:     { type: String, default: "", trim: true },
    qty:              { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const recipeSchema = new mongoose.Schema(
  {
    catalogId: { type: String, required: true, trim: true }, // "bowl-emerald-salmon", "custom-bowl", etc.
    name:      { type: String, required: true, trim: true },

    ingredients: { type: [recipeIngredientSchema], default: [] },
    packaging:   { type: [packagingLineSchema], default: [] },
    commissionPct: { type: Number, default: 0, min: 0, max: 100 },

    version:       { type: Number, required: true, default: 1 },
    effectiveDate: { type: String, default: null }, // YYYY-MM-DD
    active:        { type: Boolean, default: true },

    updatedBy: { type: String, default: null },
    notes:     { type: String, default: "", trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

recipeSchema.index({ catalogId: 1, active: 1 });
recipeSchema.index({ catalogId: 1, version: -1 });

export default mongoose.model("Recipe", recipeSchema);