import Recipe from "../models/Recipe.js";
import Inventory from "../models/Inventory.js";
import { POS_CATALOG } from "../config/posCatalog.js";
import { computeRecipeCost, recipeCompletenessStatus } from "../utils/recipeCost.js";
import { recordAudit, actorFromStaff } from "../utils/auditLog.js";
import { dateKeyInTimeZone } from "../utils/timeZone.js";

/* Mismo criterio que ya usa deductInventory en staffOrderController.js: el
   primer artículo de Inventory cuyo menuKeys incluya esa clave es el que
   "cubre" ese ingrediente para costeo -- no se inventa una segunda regla. */
async function buildInventoryMaps() {
  const items = await Inventory.find()
    .select("item unit cost portionQty yieldPct menuKeys")
    .lean();
  const byKey = new Map();
  const byId = new Map();
  for (const item of items) {
    byId.set(String(item._id), item);
    for (const key of item.menuKeys || []) {
      if (!byKey.has(key)) byKey.set(key, item);
    }
  }
  return { byKey, byId };
}

/* GET /api/staff/recipes -- todo el catálogo del POS con su receta activa
   (si existe), costo calculado y semáforo. */
export const listRecipeCosts = async (req, res) => {
  try {
    const [recipes, { byKey, byId }] = await Promise.all([
      Recipe.find({ active: true }),
      buildInventoryMaps(),
    ]);
    const recipeByCatalogId = new Map(recipes.map((r) => [r.catalogId, r]));

    const products = POS_CATALOG.map((product) => {
      const recipe = recipeByCatalogId.get(product.catalogId) || null;
      const costResult = computeRecipeCost(recipe, { inventoryByKey: byKey, inventoryById: byId, salePrice: product.price });
      const status = recipeCompletenessStatus(recipe, costResult);
      return {
        catalogId: product.catalogId,
        name: product.name,
        price: product.price,
        category: product.category,
        recipeId: recipe?._id || null,
        version: recipe?.version || null,
        status,
        ...costResult,
      };
    });

    res.json({ products });
  } catch (err) {
    res.status(500).json({ message: "Error al calcular el costo del menú", err: err.message });
  }
};

/* GET /api/staff/recipes/:catalogId -- receta activa + historial + costo. */
export const getRecipe = async (req, res) => {
  try {
    const { catalogId } = req.params;
    const product = POS_CATALOG.find((p) => p.catalogId === catalogId);
    if (!product) return res.status(404).json({ message: "Producto no encontrado en el catálogo" });

    const [active, history, { byKey, byId }] = await Promise.all([
      Recipe.findOne({ catalogId, active: true }),
      Recipe.find({ catalogId }).sort({ version: -1 }).limit(20),
      buildInventoryMaps(),
    ]);

    const costResult = computeRecipeCost(active, { inventoryByKey: byKey, inventoryById: byId, salePrice: product.price });
    const status = recipeCompletenessStatus(active, costResult);

    res.json({ product, recipe: active, history, status, ...costResult });
  } catch (err) {
    res.status(500).json({ message: "Error al obtener la receta", err: err.message });
  }
};

/* POST /api/staff/recipes  { catalogId, name, ingredients, packaging,
   commissionPct, notes } -- guarda una versión NUEVA. Nunca muta la
   anterior: la desactiva y crea otra, para que los pedidos ya pagados con
   la versión vieja conserven su snapshot de costo real. */
export const saveRecipe = async (req, res) => {
  try {
    const { catalogId, name, ingredients, packaging, commissionPct, notes } = req.body;
    const product = POS_CATALOG.find((p) => p.catalogId === catalogId);
    if (!product) return res.status(400).json({ message: "catalogId no existe en el catálogo del POS" });

    if (!Array.isArray(ingredients)) {
      return res.status(400).json({ message: "ingredients debe ser una lista" });
    }
    let cleanIngredients;
    try {
      cleanIngredients = ingredients.map((line) => {
        const key = String(line?.key || "").trim();
        const portions = Number(line?.portions);
        if (!key || !Number.isFinite(portions) || portions < 0) {
          throw new Error("Cada ingrediente necesita una clave y una cantidad de porciones válida");
        }
        return { key, portions };
      });
    } catch (validationError) {
      return res.status(400).json({ message: validationError.message });
    }

    let cleanPackaging;
    try {
      cleanPackaging = Array.isArray(packaging) ? packaging.map((line) => {
        const qty = Number(line?.qty);
        if (!Number.isFinite(qty) || qty < 0) throw new Error("Cantidad de empaque inválida");
        return {
          inventoryItemId: line?.inventoryItemId || null,
          description: String(line?.description || "").trim(),
          qty,
        };
      }) : [];
    } catch (validationError) {
      return res.status(400).json({ message: validationError.message });
    }

    const commission = Number(commissionPct);
    const cleanCommission = Number.isFinite(commission) ? Math.min(100, Math.max(0, commission)) : 0;

    const previous = await Recipe.findOne({ catalogId, active: true });
    const nextVersion = (previous?.version || 0) + 1;
    const actor = actorFromStaff(req.staff);

    const recipe = await Recipe.create({
      catalogId,
      name: (name || product.name || "").trim() || product.name,
      ingredients: cleanIngredients,
      packaging: cleanPackaging,
      commissionPct: cleanCommission,
      version: nextVersion,
      effectiveDate: dateKeyInTimeZone(),
      active: true,
      updatedBy: actor.actorName,
      notes: String(notes || "").trim().slice(0, 500),
    });

    if (previous) {
      previous.active = false;
      await previous.save();
    }

    await recordAudit({
      entity: "Recipe", entityId: recipe._id, action: previous ? "update" : "create",
      changes: [{ field: "version", oldValue: previous?.version || null, newValue: nextVersion }],
      ...actor, source: "manual",
      reason: notes ? String(notes).slice(0, 200) : `Receta v${nextVersion} de ${catalogId}`,
    });

    res.status(201).json({ recipe });
  } catch (err) {
    res.status(400).json({ message: "Error al guardar la receta", err: err.message });
  }
};