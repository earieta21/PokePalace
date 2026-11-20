/* Costo de una porción a partir de "cuánto lleva una porción" y "cuánto
   cuesta lo que se compra". Es la única cuenta que necesita el costeo: quien
   captura nunca divide paquetes entre porciones a mano.

     Pepino: porción 20 g · se compra a $29.90 el kg  →  $0.60
     Aguacate: porción ¼ pz · se compra a $11 la pieza →  $2.75
     Sriracha: porción 30 ml · botella de 793 g a $80  →  $3.03 */

const normalize = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "");

// Cuánto vale cada unidad en gramos o mililitros.
const MASS = {
  kg: 1000, kilo: 1000, kilos: 1000, kilogramo: 1000, kilogramos: 1000,
  g: 1, gr: 1, grs: 1, gramo: 1, gramos: 1,
};
const VOLUME = {
  l: 1000, lt: 1000, lts: 1000, litro: 1000, litros: 1000,
  ml: 1, gal: 3785.41, galon: 3785.41,
};

/** { kind: "mass" | "volume" | "piece", base } — base en g o ml (1 si es pieza). */
export function measureOf(unit) {
  const key = normalize(unit);
  if (key in MASS) return { kind: "mass", base: MASS[key] };
  if (key in VOLUME) return { kind: "volume", base: VOLUME[key] };
  return { kind: "piece", base: 1 };
}

export const isMeasurable = (unit) => measureOf(unit).kind !== "piece";

// Gramos y mililitros se toman como equivalentes (densidad ≈ 1): aderezos,
// salsas y marinados se porcionan por volumen aunque se compren por peso.
const sameFamily = (a, b) => a === b || (a !== "piece" && b !== "piece");

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

/**
 * Costo de una porción. `portion` = { amount, unit } con unit g | ml | pz.
 * `purchase` = { price, unit, contentAmount, contentUnit }: price es lo que
 * cuesta UNA unidad de compra (un kg, un litro, una pieza, una botella…) y,
 * si esa unidad es una pieza pero la porción va en gramos o ml, contentAmount
 * + contentUnit dicen cuánto trae cada pieza.
 * Regresa { cost } o { cost: 0, reason } con lo que falta en palabras.
 */
export function portionCostOf(portion, purchase) {
  const amount = Number(portion?.amount) || 0;
  const price = Number(purchase?.price) || 0;
  if (amount <= 0) return { cost: 0, reason: "Falta cuánto lleva una porción." };
  if (price <= 0) return { cost: 0, reason: "Falta el precio de compra." };

  const portionMeasure = measureOf(portion.unit);
  const priceMeasure = measureOf(purchase.unit);

  if (priceMeasure.kind === "piece") {
    if (portionMeasure.kind === "piece") return { cost: round4(amount * price) };
    const content = measureOf(purchase.contentUnit);
    const contentBase = (Number(purchase.contentAmount) || 0) * content.base;
    if (contentBase <= 0 || !sameFamily(content.kind, portionMeasure.kind)) {
      return { cost: 0, reason: `Falta cuánto trae cada ${purchase.unit || "pieza"} (en g o ml).` };
    }
    return { cost: round4(((amount * portionMeasure.base) / contentBase) * price) };
  }

  if (portionMeasure.kind === "piece") {
    return { cost: 0, reason: `Se compra por ${purchase.unit}: pon la porción en gramos o ml.` };
  }
  return { cost: round4(((amount * portionMeasure.base) / priceMeasure.base) * price) };
}

export const PORTION_UNITS = ["g", "ml", "pz"];
export const PURCHASE_UNITS = ["kg", "g", "l", "ml", "pz"];
