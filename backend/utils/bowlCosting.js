import {
  MEDIUM_BOWL_PROTEIN_KG,
  LARGE_BOWL_PROTEIN_KG,
} from "../config/posCatalog.js";

export const BOWL_PRICE = 230;         // bowl mediano
export const LARGE_BOWL_PRICE = 250;   // 3 proteínas
export const PROMO_2X1_PRICE = 250;    // 2 bowls medianos
export const COMBO_PALACE_PRICE = 289;

export const PROTEIN_KEYS = ["tuna", "salmon", "shrimp", "tofu", "octopus", "seared_tuna"];

export const COMPLEMENT_KEYS = [
  "shredded_carrots", "cucumber", "mango", "jicama", "seaweed", "avocado",
  "edamame", "red_onion", "beet", "surimi", "spicy_surimi",
  "kale", "peas", "corn", "pineapple", "chia_seeds",
];

export const COMPLEMENT_LABELS = {
  shredded_carrots: "Zanahoria Rallada",
  cucumber: "Pepino",
  mango: "Mango",
  jicama: "Jícama",
  seaweed: "Ensalada de Alga",
  avocado: "Aguacate",
  edamame: "Edamame",
  red_onion: "Cebolla Morada",
  beet: "Betabel",
  surimi: "Surimi",
  spicy_surimi: "Spicy Surimi",
  kale: "Col Rizada",
  peas: "Chícharos",
  corn: "Maíz",
  pineapple: "Piña",
  chia_seeds: "Semillas de Chía",
};

export const PROTEIN_LABELS = {
  tuna: "Atún",
  salmon: "Salmón",
  shrimp: "Camarón",
  tofu: "Tofu",
  octopus: "Pulpo",
  seared_tuna: "Atún Sellado",
};

// El inventario todavía no tiene `menuKeys` llenos en la comida, así que como
// respaldo se empata por nombre. Si algún día se llenan los menuKeys, esos
// ganan y esta lista deja de usarse sola.
const INVENTORY_NAME_ALIASES = {
  tuna: ["atun", "atun aleta amarilla"],
  salmon: ["salmon"],
  shrimp: ["camaron", "camaron cocido"],
  tofu: ["tofu"],
  octopus: ["pulpo"],
  seared_tuna: ["atun sellado", "atun"],
};

// Igual que las proteínas: el inventario no tiene `menuKeys` llenos, así que
// se empata por nombre como respaldo.
const COMPLEMENT_INVENTORY_ALIASES = {
  shredded_carrots: ["zanahoria", "zanahoria rallada"],
  cucumber: ["pepino"],
  mango: ["mango"],
  jicama: ["jicama"],
  seaweed: ["wakame alga", "alga", "ensalada de alga"],
  avocado: ["aguacate"],
  edamame: ["edamame"],
  red_onion: ["cebolla morada"],
  beet: ["betabel"],
  surimi: ["surimi"],
  spicy_surimi: ["surimi"],
  kale: ["kale", "col rizada"],
  peas: ["chicharo", "chicharos"],
  corn: ["elote", "maiz"],
  pineapple: ["pina"],
  chia_seeds: ["chia delgada", "chia", "semillas de chia"],
};

const normalize = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "");

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Costo por kg de cada proteína, resuelto en este orden:
 *   1. override manual capturado en el costeo,
 *   2. artículo de inventario ligado por menuKeys,
 *   3. artículo de inventario que empata por nombre.
 * Solo sirve el inventario medido en kg: un artículo en "pz" o "paq" no dice
 * cuánto pesa, y adivinarlo daría un margen falso.
 */
export function resolveProteinCosts(inventoryItems = [], overrides = {}) {
  const byKey = {};

  for (const key of PROTEIN_KEYS) {
    const override = Number(overrides?.[key]);
    if (Number.isFinite(override) && override > 0) {
      byKey[key] = { costPerKg: override, source: "manual" };
      continue;
    }

    const linked = inventoryItems.find((item) => (item.menuKeys || []).includes(key));
    const aliases = INVENTORY_NAME_ALIASES[key] || [];
    const byName = inventoryItems.find((item) => aliases.includes(normalize(item.item)));
    const match = linked || byName;

    if (match && normalize(match.unit) === "kg" && Number(match.cost) > 0) {
      byKey[key] = { costPerKg: Number(match.cost), source: "inventario", itemName: match.item };
    } else {
      byKey[key] = {
        costPerKg: 0,
        source: "falta",
        itemName: match?.item || null,
        // Por qué no se pudo: ayuda a que quien captura sepa qué arreglar.
        reason: !match
          ? "No hay artículo de inventario que empate con esta proteína."
          : normalize(match.unit) !== "kg"
            ? `"${match.item}" se lleva por ${match.unit}, no por kg — captura el costo por kg aquí.`
            : `"${match.item}" no tiene costo capturado en el inventario.`,
      };
    }
  }

  return byKey;
}

const partCost = (part) => round2((Number(part?.costPerUnit) || 0) * (Number(part?.unitsPerBowl) || 0));

/**
 * Costo de la porción de base. Si ya se capturó costo por kilo y gramos por
 * porción, esos mandan — es el dato más fiel. Si no, se usa el costo por
 * porción capturado a mano (como estaba antes).
 */
export function baseCost(config) {
  const perKg = Number(config?.baseCostPerKg) || 0;
  const grams = Number(config?.baseGramsPerPortion) || 0;
  if (perKg > 0 && grams > 0) return round2((perKg / 1000) * grams);
  return partCost(config?.base);
}

/**
 * Costo por porción de cada complemento. Se arma igual que las proteínas: el
 * precio de la unidad (kilo, pieza o paquete) sale del inventario cuando se
 * puede, y quien captura solo dice cuántas porciones rinde esa unidad — que es
 * el dato que el inventario no tiene y nadie más puede saber.
 */
export function resolveComplementCosts(inventoryItems = [], captured = {}) {
  const byKey = {};

  for (const key of COMPLEMENT_KEYS) {
    const entry = captured?.[key] || {};
    const portions = Number(entry.portionsPerUnit) || 0;
    const manualCost = Number(entry.costPerUnit) || 0;

    const linked = inventoryItems.find((item) => (item.menuKeys || []).includes(key));
    const aliases = COMPLEMENT_INVENTORY_ALIASES[key] || [];
    const byName = inventoryItems.find((item) => aliases.includes(normalize(item.item)));
    const match = linked || byName;
    const inventoryCost = Number(match?.cost) > 0 ? Number(match.cost) : 0;

    const costPerUnit = manualCost > 0 ? manualCost : inventoryCost;
    byKey[key] = {
      costPerUnit,
      portionsPerUnit: portions,
      unit: match?.unit || null,
      itemName: match?.item || null,
      source: manualCost > 0 ? "manual" : inventoryCost > 0 ? "inventario" : "falta",
      costPerPortion: costPerUnit > 0 && portions > 0 ? round2(costPerUnit / portions) : 0,
    };
  }

  return byKey;
}

/**
 * Costo de complementos de un bowl promedio: cada complemento pesa según qué
 * tan seguido lo piden (aguacate en 77% de los bowls pesa más que jícama en
 * 0%). Sin nada capturado, cae al promedio simple × cantidad.
 */
export function complementsCost(config, usage, complementCosts) {
  const disabled = new Set(config?.disabledComplements || []);
  const withCost = COMPLEMENT_KEYS.filter(
    (key) => !disabled.has(key) && (complementCosts?.[key]?.costPerPortion || 0) > 0
  );
  if (withCost.length === 0 || !usage) return partCost(config?.complements);

  let total = 0;
  for (const key of withCost) {
    total += complementCosts[key].costPerPortion * (Number(usage.frequency?.[key]) || 0);
  }
  return round2(total);
}

/** Desglose de costo de un bowl con una proteína, igual que la tabla de costeo. */
export function computeBowlCost({ config, proteinCosts, proteinKey, size = "normal", complementUsage = null, complementCosts = null }) {
  const kg = size === "large" ? LARGE_BOWL_PROTEIN_KG : MEDIUM_BOWL_PROTEIN_KG;
  const proteinCostPerKg = proteinCosts?.[proteinKey]?.costPerKg || 0;

  const rows = {
    base: baseCost(config),
    protein: round2(proteinCostPerKg * kg),
    marinades: partCost(config.marinades),
    complements: complementsCost(config, complementUsage, complementCosts),
    sauces: partCost(config.sauces),
    toppings: partCost(config.toppings),
    packaging: partCost(config.packaging),
  };

  const total = round2(Object.values(rows).reduce((sum, value) => sum + value, 0));
  const price = size === "large" ? LARGE_BOWL_PRICE : BOWL_PRICE;

  return {
    proteinKey,
    label: PROTEIN_LABELS[proteinKey] || proteinKey,
    proteinKg: kg,
    proteinCostPerKg,
    proteinSource: proteinCosts?.[proteinKey]?.source || "falta",
    proteinNote: proteinCosts?.[proteinKey]?.reason || null,
    rows,
    total,
    price,
    ...marginOf(price, total),
    // Escenarios de promoción, con el mismo costo y distinto precio efectivo.
    scenarios: {
      promo2x1: { price: round2(PROMO_2X1_PRICE / 2), ...marginOf(PROMO_2X1_PRICE / 2, total) },
      halfPriceSecond: { price: round2(BOWL_PRICE * 0.5), ...marginOf(BOWL_PRICE * 0.5, total) },
    },
  };
}

function marginOf(price, cost) {
  const margin = round2(price - cost);
  return {
    margin,
    marginPct: price > 0 ? round2((margin / price) * 100) : 0,
    // Lo que realmente se gasta en producto por cada peso vendido.
    foodCostPct: price > 0 ? round2((cost / price) * 100) : 0,
  };
}

/** Costo del Combo Palace (bowl + bebida + rice cake) contra su precio. */
export function computeComboCost({ config, bowlTotal }) {
  const total = round2(bowlTotal + (Number(config.comboDrinkCost) || 0) + (Number(config.comboRiceCakeCost) || 0));
  return { total, price: COMBO_PALACE_PRICE, ...marginOf(COMBO_PALACE_PRICE, total) };
}

/**
 * Margen real ponderado por lo que de verdad se vende. Un margen "promedio"
 * simple miente cuando el atún (barato) se vende el doble que el salmón (caro):
 * esto pesa cada proteína por sus ventas reales del periodo.
 */
export function weightedMargin(bowls, salesMix) {
  let cost = 0;
  let revenue = 0;
  let units = 0;

  for (const bowl of bowls) {
    const sold = Number(salesMix?.[bowl.proteinKey]) || 0;
    if (sold <= 0 || bowl.total <= 0) continue;
    cost += bowl.total * sold;
    revenue += bowl.price * sold;
    units += sold;
  }

  if (units === 0) return null;
  return {
    units,
    cost: round2(cost),
    revenue: round2(revenue),
    margin: round2(revenue - cost),
    marginPct: revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : 0,
    foodCostPct: revenue > 0 ? round2((cost / revenue) * 100) : 0,
  };
}

/** Aplica las reglas de decisión del negocio a un bowl ya costeado. */
export function promoVerdict(bowl, config) {
  if (bowl.total <= 0) return { status: "sin_datos", message: "Falta capturar costos." };

  const eligible = bowl.marginPct >= config.promoEligibleMinMarginPct;
  const promoMargin = bowl.scenarios.promo2x1.marginPct;

  if (!eligible) {
    return {
      status: "fuera",
      message: `Margen sin promo ${bowl.marginPct}% < ${config.promoEligibleMinMarginPct}% — no entra al 2x1.`,
    };
  }
  if (promoMargin < config.promoMinMarginPct) {
    return {
      status: "mitad",
      message: `En 2x1 el margen cae a ${promoMargin}% (mínimo ${config.promoMinMarginPct}%) — mejor "segundo bowl a mitad de precio".`,
    };
  }
  return { status: "apto", message: `Apto para 2x1: mantiene ${promoMargin}% de margen.` };
}
