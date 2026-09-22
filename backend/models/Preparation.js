import mongoose from "mongoose";

/**
 * Una línea de la receta. Se guarda igual que la hoja de costeo del negocio:
 * la presentación es el tamaño del paquete que se compra, la receta es cuánto
 * de ese paquete entra al lote, y el precio unitario es lo que cuesta el
 * paquete completo. El costo se calcula, nunca se captura — así no se queda
 * viejo cuando cambia el precio del proveedor.
 */
const ingredientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // kg/gr/lt/ml/pz — unidad en la que viene la presentación.
    unit: { type: String, default: "kg", trim: true },
    presentation: { type: Number, default: 0, min: 0 },
    recipeAmount: { type: Number, default: 0, min: 0 },
    unitPrice: { type: Number, default: 0, min: 0 },
    // Cuando se liga a un artículo del inventario, el precio unitario se lee
    // de ahí y deja de capturarse a mano.
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory", default: null },
    // Para cosas que se cuentan al tanteo (una pizca de sal, 3 dientes de
    // ajo): se anota el costo directo y ya.
    flatCost: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const preparationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // aderezo | marinado | mezcla — solo para agrupar en la pantalla.
    tipologia: { type: String, default: "aderezo", trim: true },
    // Ingrediente del menú al que alimenta (p. ej. "spicy_mayo"). Con esto el
    // costeo del bowl usa el costo real de la preparación en vez de un número
    // capturado a mano.
    menuKey: { type: String, default: null, index: true },
    // Cuántas porciones de bowl rinde un lote. Sin esto solo se sabe lo que
    // cuesta el lote, no lo que cuesta ponerlo en un bowl.
    yieldPortions: { type: Number, default: 0, min: 0 },
    ingredients: { type: [ingredientSchema], default: [] },
    notes: { type: String, default: "" },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Preparation
  || mongoose.model("Preparation", preparationSchema);
