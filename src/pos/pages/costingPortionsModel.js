import {
  BASE_LABELS, COMPLEMENT_LABELS, SAUCE_LABELS, MARINADE_LABELS, TOPPING_LABELS,
} from "../../order/OrderLabels";
import { measureOf, portionCostOf } from "../../../backend/utils/portionCost.js";

/* Datos y cuentas de la pantalla "¿Cuánto lleva una porción?". Los
   componentes viven en CostingPortions.jsx. */

export const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

export const CATEGORIES = [
  {
    key: "base", label: "Base", labels: BASE_LABELS, warnAt: 15,
    hint: "Pon los gramos tal como compras el producto: si el arroz se compra crudo, los gramos de arroz crudo que lleva un bowl.",
    chips: [[60, "g"], [80, "g"], [100, "g"], [150, "g"]],
  },
  {
    key: "complements", label: "Complementos", labels: COMPLEMENT_LABELS, warnAt: 15,
    hint: "Lo que se sirve de cada complemento en un bowl.",
    chips: [[20, "g"], [30, "g"], [40, "g"], [0.25, "pz"]],
  },
  {
    key: "sauces", label: "Salsas y aderezos", labels: SAUCE_LABELS, warnAt: 10,
    hint: "Las que se preparan en casa toman el costo de su receta; las que se compran hechas, de aquí.",
    chips: [[15, "ml"], [30, "ml"], [60, "ml"]],
  },
  {
    key: "marinades", label: "Marinados", labels: MARINADE_LABELS, warnAt: 10,
    hint: "Se preparan en casa: toman el costo de su receta en la pestaña Recetas.",
    chips: [[15, "ml"], [30, "ml"]],
  },
  {
    key: "toppings", label: "Toppings", labels: TOPPING_LABELS, warnAt: 8,
    hint: "Una cucharada de ajonjolí son unos 4 g; una de cebolla crujiente, unos 12 g.",
    chips: [[1, "g"], [4, "g"], [7, "g"], [13, "g"]],
  },
];

export const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

export const defaultUnit = (category) => (["sauces", "marinades"].includes(category) ? "ml" : "g");

export const chipLabel = ([amount, unit]) => (
  unit === "pz" && amount === 0.25 ? "¼ pieza"
    : unit === "ml" && amount === 30 ? "1 oz (30 ml)"
      : `${amount} ${unit}`
);

export const unitLabel = (unit) => ({ kg: "kg", g: "g", l: "litro", ml: "ml", pz: "pieza" }[unit] || unit);

export const emptyPortion = (category) => ({
  amount: "", unit: defaultUnit(category), inventoryItemId: "", price: "", priceUnit: "kg",
  useManualPrice: false, contentAmount: "", contentUnit: "g",
});

/** Lo guardado → lo que muestran los campos (texto, vacío en vez de 0). */
export const portionToForm = (entry, category) => (entry ? {
  amount: entry.amount ? String(entry.amount) : "",
  unit: entry.unit || defaultUnit(category),
  inventoryItemId: entry.inventoryItemId || "",
  price: entry.price ? String(entry.price) : "",
  priceUnit: entry.priceUnit || "kg",
  useManualPrice: Boolean(entry.useManualPrice),
  contentAmount: entry.contentAmount ? String(entry.contentAmount) : "",
  contentUnit: entry.contentUnit || "g",
} : emptyPortion(category));

/**
 * Lo que se muestra al abrir una opción. Si no hay nada guardado y el
 * inventario la tiene por pieza (aguacate, limón…), la porción empieza en
 * piezas para no tener que pesar una.
 */
export function initialPortion({ saved, item, inventoryById, category }) {
  if (saved) return portionToForm(saved, category);
  const auto = item?.autoItemId ? inventoryById.get(item.autoItemId) : null;
  const byPiece = auto && measureOf(auto.unit).kind === "piece" && category === "complements";
  return byPiece ? { ...emptyPortion(category), unit: "pz" } : emptyPortion(category);
}

export const portionToPayload = (entry) => ({
  amount: Number(entry.amount) || 0,
  unit: entry.unit,
  inventoryItemId: entry.inventoryItemId || null,
  price: Number(entry.price) || 0,
  priceUnit: entry.priceUnit,
  useManualPrice: Boolean(entry.useManualPrice),
  contentAmount: Number(entry.contentAmount) || 0,
  contentUnit: entry.contentUnit,
});

/**
 * La misma cuenta que el servidor (backend/utils/bowlCosting.js,
 * resolveIngredientCosts) para ver el costo mientras se captura, sin guardar.
 * `item` es la opción tal como la regresó el reporte.
 */
export function previewPortion({ entry, item, inventoryById, category }) {
  if (item?.source === "receta") return { cost: item.costPerPortion, source: "receta" };
  const portion = { amount: Number(entry?.amount) || 0, unit: entry?.unit || defaultUnit(category) };
  const content = { contentAmount: Number(entry?.contentAmount) || 0, contentUnit: entry?.contentUnit || "g" };
  const fromItem = (inv) => (inv && inv.cost > 0
    ? { price: inv.cost, unit: inv.unit, ...content, source: "inventario", itemName: inv.item }
    : null);
  const manual = Number(entry?.price) > 0
    ? { price: Number(entry.price), unit: entry.priceUnit || "kg", ...content, source: "manual" }
    : null;
  const explicit = entry?.inventoryItemId ? inventoryById.get(entry.inventoryItemId) : null;
  const auto = item?.autoItemId ? inventoryById.get(item.autoItemId) : null;
  const candidates = (explicit ? [fromItem(explicit)] : entry?.useManualPrice ? [manual] : [fromItem(auto), manual])
    .filter(Boolean);

  let chosen = null;
  let reason = candidates.length ? null : portion.amount > 0 ? "Falta el precio de compra." : "Falta cuánto lleva una porción.";
  for (const candidate of candidates) {
    const attempt = portionCostOf(portion, candidate);
    if (attempt.cost > 0) return { cost: attempt.cost, source: candidate.source, chosen: candidate };
    if (!chosen) { chosen = candidate; reason = attempt.reason; }
  }
  // Complementos capturados con la pantalla anterior (costo ÷ porciones).
  if (item?.usesOldComplementEntry && item.costPerPortion > 0) {
    return { cost: item.costPerPortion, source: "anterior", chosen };
  }
  return { cost: 0, source: "falta", chosen, reason };
}

/** Lo que falta para que el costo sea exacto, de lo que más pesa a lo que menos. */
export function pendingSteps(data) {
  const steps = [];
  const hasUsage = (data?.complementUsage?.bowls || 0) > 0;
  for (const bowl of data?.bowls || []) {
    if (bowl.proteinSource === "falta") {
      steps.push({ id: `protein-cost-${bowl.proteinKey}`, type: "proteinCost", key: bowl.proteinKey, label: bowl.label, weight: 100 + (bowl.sold30d || 0) });
    } else if (data.config?.proteinYieldPct?.[bowl.proteinKey] === undefined) {
      // La merma pesa menos que una porción sin costo: va al final.
      steps.push({ id: `protein-yield-${bowl.proteinKey}`, type: "proteinYield", key: bowl.proteinKey, label: bowl.label, weight: -1 + (bowl.sold30d || 0) / 1e6 });
    }
  }
  for (const category of CATEGORIES) {
    for (const item of data?.ingredients?.[category.key] || []) {
      if (item.source !== "falta") continue;
      if (hasUsage && !(item.frequency > 0)) continue;
      const label = category.labels[item.key] || item.key;
      if (item.recipeId && item.recipeMissingYield) {
        steps.push({ id: `recipe-${item.recipeId}`, type: "recipeYield", recipeId: item.recipeId, recipeName: item.recipeName, label, category: category.key, weight: item.frequency });
      } else if (!item.recipeId) {
        steps.push({ id: `portion-${item.key}`, type: "portion", key: item.key, label, category: category.key, item, weight: item.frequency });
      }
    }
  }
  return steps.sort((a, b) => b.weight - a.weight);
}
