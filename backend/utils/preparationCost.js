const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Todo se lleva a la unidad base (gramos o mililitros) para poder dividir
// receta entre presentación aunque estén en escalas distintas: la hoja de
// costeo anota la presentación en kg pero la receta en gramos.
const TO_BASE = { kg: 1000, gr: 1, g: 1, lt: 1000, l: 1000, ml: 1, pz: 1, pieza: 1, mnj: 1, diente: 1 };

const factorOf = (unit) => TO_BASE[String(unit || "").trim().toLowerCase()] ?? 1;

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
