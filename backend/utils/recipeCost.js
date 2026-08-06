const round2 = (n) => Math.round(n * 100) / 100;

/* Costo de 1 línea de ingrediente: cuántas unidades de compra hacen falta
   para obtener la porción real, considerando el rendimiento (merma de
   limpieza/corte). Si el ingrediente no tiene portionQty/yieldPct/cost
   capturados todavía, la línea queda incompleta -- nunca se inventa un
   número "razonable". */
export function computeIngredientLineCost(inventoryItem, portions) {
  if (!inventoryItem || inventoryItem.portionQty == null || inventoryItem.yieldPct == null || inventoryItem.cost == null) {
    return { cost: 0, complete: false };
  }
  if (inventoryItem.yieldPct <= 0) return { cost: 0, complete: false };
  const effectiveQtyPerPortion = inventoryItem.portionQty / (inventoryItem.yieldPct / 100);
  const cost = round2(effectiveQtyPerPortion * inventoryItem.cost * (Number(portions) || 0));
  return { cost, complete: true };
}

/* Costo completo de una receta: ingredientes + empaque + comisión estimada,
   contra el precio de venta VIVO del catálogo (nunca uno guardado que se
   volvería viejo). `inventoryByKey` mapea el id de ingrediente (igual a
   menuKeys/inventoryRecipe, ej. "salmon") -> documento de Inventory;
   `inventoryById` mapea _id de Inventory -> documento, para líneas de
   empaque que apuntan a un artículo de inventario directo. */
export function computeRecipeCost(recipe, { inventoryByKey, inventoryById, salePrice = null } = {}) {
  const missing = [];
  let ingredientsCost = 0;
  const hasIngredients = (recipe?.ingredients?.length ?? 0) > 0;

  for (const line of recipe?.ingredients || []) {
    const item = inventoryByKey?.get(line.key);
    if (!item) { missing.push(line.key); continue; }
    const { cost, complete } = computeIngredientLineCost(item, line.portions);
    ingredientsCost += cost;
    if (!complete) missing.push(line.key);
  }
  ingredientsCost = round2(ingredientsCost);

  let packagingCost = 0;
  for (const line of recipe?.packaging || []) {
    if (!line.inventoryItemId) { missing.push(`empaque:${line.description || "sin vincular"}`); continue; }
    const item = inventoryById?.get(String(line.inventoryItemId));
    if (!item || item.cost == null) { missing.push(`empaque:${line.description || line.inventoryItemId}`); continue; }
    packagingCost += item.cost * (Number(line.qty) || 0);
  }
  packagingCost = round2(packagingCost);

  const commissionPct = Number(recipe?.commissionPct) || 0;
  const commission = round2((salePrice ?? 0) * (commissionPct / 100));
  const fullCost = round2(ingredientsCost + packagingCost + commission);
  const profit = salePrice != null ? round2(salePrice - fullCost) : null;
  const marginPct = salePrice ? round2((profit / salePrice) * 100) : null;

  const complete = hasIngredients && missing.length === 0;

  return { ingredientsCost, packagingCost, commission, fullCost, profit, marginPct, complete, missing, hasIngredients };
}

/* Semáforo de Costo del menú:
   rojo    = no hay receta activa, o la receta no tiene ingredientes.
   amarillo = tiene receta, pero falta algún costo/rendimiento/porción.
   verde   = receta completa, todos los costos calculables. */
export function recipeCompletenessStatus(recipe, costResult) {
  if (!recipe || !costResult?.hasIngredients) return "red";
  return costResult.complete ? "green" : "yellow";
}