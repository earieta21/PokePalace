import { isMeasurable, measureOf } from "./portionCost.js";

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Todo se lleva a la unidad base (gramos o mililitros) para poder dividir
// receta entre presentación aunque estén en escalas distintas: la hoja de
// costeo anota la presentación en kg pero la receta en gramos. Piezas,
// manojos, botellas… valen 1.
const factorOf = (unit) => measureOf(unit).base;

/**
 * Costo de una línea: cuánto del paquete entra al lote, por lo que cuesta el
 * paquete. La receta se interpreta en la unidad base (gramos/ml) y la
 * presentación en la unidad capturada — igual que en la hoja del negocio,
 * donde "CREMA, KG, 5, 417" significa 417 g de un paquete de 5 kg.
 */
export function ingredientCost(line) {
  const flat = Number(line?.flatCost) || 0;
  if (flat > 0) return round2(flat);

  const presentationBase = (Number(line?.presentation) || 0) * factorOf(line?.unit);
  const recipe = Number(line?.recipeAmount) || 0;
  const price = Number(line?.unitPrice) || 0;
  if (presentationBase <= 0 || recipe <= 0 || price <= 0) return 0;

  return round2((recipe / presentationBase) * price);
}

/**
 * El precio unitario de una línea ligada al inventario se lee en vivo: así la
 * receta no se queda con un precio viejo cuando cambia el del proveedor, que
 * es justo lo que pasaba en la hoja de cálculo.
 */
export function withLivePrices(prep, inventoryById) {
  const doc = typeof prep.toObject === "function" ? prep.toObject() : { ...prep };
  doc.ingredients = (doc.ingredients || []).map((line) => {
    const linked = line.inventoryItemId && inventoryById.get(String(line.inventoryItemId));
    if (!linked) return { ...line, priceSource: "manual" };
    const live = {
      ...line,
      unitPrice: Number(linked.cost) || 0,
      priceSource: "inventario",
      inventoryItemName: linked.item,
      inventoryUnit: linked.unit,
    };
    // El inventario guarda el precio de UNA unidad (un kg, un litro, una
    // pieza), no del paquete. Si se compra por peso o volumen, la
    // "presentación" es esa unidad: antes se tomaba la presentación capturada
    // (p. ej. 5 kg) y el costo salía 5 veces más bajo, o una botella se leía
    // como gramos y salía miles de veces más alto.
    if (isMeasurable(linked.unit)) return { ...live, unit: linked.unit, presentation: 1 };
    // Por pieza (botella, lata, paquete…): la presentación dice cuánto trae
    // cada pieza en la unidad de la línea. Si la línea también va en piezas,
    // la receta cuenta piezas.
    return isMeasurable(line.unit)
      ? live
      : { ...live, unit: linked.unit, presentation: Number(line.presentation) || 1 };
  });
  return doc;
}

/** Costo del lote completo y por porción. */
export function preparationCost(prep) {
  const lines = (prep?.ingredients || []).map((line) => ({
    ...(typeof line.toObject === "function" ? line.toObject() : line),
    cost: ingredientCost(line),
  }));

  const batchCost = round2(lines.reduce((sum, line) => sum + line.cost, 0));
  const portions = Number(prep?.yieldPortions) || 0;

  return {
    lines,
    batchCost,
    portions,
    costPerPortion: portions > 0 ? round2(batchCost / portions) : 0,
    // Sin rendimiento solo se sabe lo que cuesta el lote; se avisa en vez de
    // inventar una porción.
    missingYield: portions <= 0,
  };
}
