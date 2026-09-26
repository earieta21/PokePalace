// Protein demand is expressed in kg; all other recipe demand is in servings.
export const PROTEIN_KEYS = new Set(["tuna", "salmon", "shrimp", "tofu", "octopus", "seared_tuna"]);
const INDIVIDUAL_UNITS = new Set(["pz", "pc", "pieza", "piezas", "botellas", "bottles", "latas", "porciones", "vasos"]);
const DRINK_KEYS = new Set(["topochico", "coca_zero", "coca_cola", "botella_de_agua", "agua_natural"]);
// One 16 US fl oz serving, rounded to the stock ledger's six decimals.
export const AGUA_DEL_DIA_PORTION_LITERS = 0.473176;

export function consumptionRate(item, key) {
  const unit = String(item.unit || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (PROTEIN_KEYS.has(key)) {
    if (unit === "kg") return 1;
    if (unit === "g") return 1000;
    return null;
  }
  const configured = Number(item.quantityPerPortion);
  if (Number.isFinite(configured) && configured > 0) return configured;
  if (key === "agua_natural") {
    if (unit === "l") return AGUA_DEL_DIA_PORTION_LITERS;
    if (unit === "ml") return AGUA_DEL_DIA_PORTION_LITERS * 1000;
  }
  if (["porcion", "porciones", "vaso", "vasos"].includes(unit)) return 1;
  if (DRINK_KEYS.has(key) && INDIVIDUAL_UNITS.has(unit)) return 1;
  return null;
}

export function inventoryConsumptionStatus(item) {
  const keys = [...new Set(item.menuKeys || [])];
  if (!keys.length) return { ready: false, label: "Sin vínculo de venta" };
  if (keys.some((key) => consumptionRate(item, key) === null)) {
    return { ready: false, label: keys.some((key) => PROTEIN_KEYS.has(key))
      ? "Proteína: registra existencia en kg o g" : "Falta cantidad por porción" };
  }
  if (keys.every((key) => PROTEIN_KEYS.has(key))) return { ready: true, label: "Automático por gramaje" };
  return { ready: true, label: `${consumptionRate(item, keys[0])} ${item.unit} por porción` };
}

export function inventoryDemandForItem(item, demand) {
  let quantity = 0;
  const missingKeys = [];
  for (const key of new Set(item.menuKeys || [])) {
    if (!(demand[key] > 0)) continue;
    const rate = consumptionRate(item, key);
    if (rate === null) missingKeys.push(key);
    else quantity += demand[key] * rate;
  }
  return { quantity: Number(quantity.toFixed(6)), missingKeys };
}
