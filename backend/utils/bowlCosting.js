import {
  MEDIUM_BOWL_PROTEIN_KG,
  LARGE_BOWL_PROTEIN_KG,
  BOWL_CHOICE_KEYS,
} from "../config/posCatalog.js";
import {
  BOWL_BASE_PRICE,
  LARGE_BOWL_UPCHARGE,
  PREMIUM_PROTEIN_PRICES,
  PROMO_2X1_BOWLS_PRICE,
  isPromo2x1Protein,
} from "../pricing.js";
import { BOWL_CATALOG as CUSTOMER_BOWL_CHOICES } from "./customerOrder.js";
import { portionCostOf } from "./portionCost.js";

export const BOWL_PRICE = BOWL_BASE_PRICE;                                // bowl mediano
export const LARGE_BOWL_PRICE = BOWL_BASE_PRICE + LARGE_BOWL_UPCHARGE;   // 3 proteínas
export const PROMO_2X1_PRICE = PROMO_2X1_BOWLS_PRICE;                     // 2 bowls medianos
// Cada bowl del 2x1 lleva 60 g: los 120 g de un bowl grande repartidos en 2,
// igual que los descuenta el inventario (posCatalog.addItemDemand).
export const PROMO_2X1_PROTEIN_KG = LARGE_BOWL_PROTEIN_KG / 2;
export const COMBO_PALACE_PRICE = 289;

// Los precios del menú traen el IVA incluido (pricing.js: TAX_RATE = 0) y el
// negocio sí lo paga (ver services/fiscalCalc.js). De cada $230 solo $198.28
// son del negocio: el margen se mide contra eso, no contra el precio de menú.
export const IVA_RATE = 0.16;

export const PROTEIN_KEYS = ["tuna", "salmon", "shrimp", "tofu", "octopus", "seared_tuna"];

export const COMPLEMENT_KEYS = [
  "shredded_carrots", "cucumber", "mango", "jicama", "seaweed", "avocado",
  "edamame", "red_onion", "beet", "surimi", "spicy_surimi",
  "kale", "peas", "corn", "pineapple", "chia_seeds",
];

// Las demás partes del bowl que el cliente elige. Cada una se pondera por qué
// tan seguido la piden y, si ya tiene receta estándar, usa su costo real.
// Se juntan las opciones del POS y las del sitio/kiosco: el Marinado Dulce,
// por ejemplo, solo se pide desde el kiosco y antes quedaba fuera de la cuenta.
const choicesOf = (field) => [...new Set([
  ...(BOWL_CHOICE_KEYS[field] || []),
  ...(CUSTOMER_BOWL_CHOICES[field] || []),
])];
export const RECIPE_PARTS = {
  base: choicesOf("base"),
  marinades: choicesOf("marinades"),
  sauces: choicesOf("sauces"),
  toppings: choicesOf("toppings"),
};

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

// Mismo respaldo por nombre para la base, los toppings y las salsas que se
// compran hechas. Las que se preparan en casa se costean con su receta.
const INGREDIENT_INVENTORY_ALIASES = {
  ...COMPLEMENT_INVENTORY_ALIASES,
  white_rice: ["arroz", "arroz blanco", "arroz para sushi", "arroz sushi"],
  brown_rice: ["arroz integral"],
  quinoa: ["quinoa", "quinua"],
  spring_mix: ["mezcla de lechugas", "spring mix", "lechuga", "ensalada", "ensalada organica"],
  sesame_seeds: ["ajonjoli", "ajonjoli tostado", "ajonjoli blanco"],
  crispy_onions: ["cebolla crujiente"],
  nori_strips: ["alga nori", "nori", "tiras de alga nori"],
  red_pepper_flakes: ["chile quebrado", "hojuelas de chile", "pimienta roja en hojuelas"],
  black_olives: ["aceitunas", "aceitunas negras"],
  toasted_peanuts: ["cacahuate", "cacahuate tostado"],
  masago: ["masago"],
  croutons: ["crotones"],
  pickled_radish: ["rabano encurtido"],
  toasted_coconut: ["coco", "coco tostado", "coco rallado"],
  pumpkin_seeds: ["pepitas", "semilla de calabaza"],
  furikake: ["furikake"],
  sriracha: ["sriracha", "siracha"],
  soy_sauce: ["soya", "salsa de soya"],
  sweet_chili: ["salsa de chile dulce", "chile dulce"],
};

// Los grupos de ingredientes que se costean por porción, en el orden en que
// se muestran en la pantalla de Costeo.
export const INGREDIENT_CATEGORIES = {
  base: RECIPE_PARTS.base,
  complements: COMPLEMENT_KEYS,
  sauces: RECIPE_PARTS.sauces,
  marinades: RECIPE_PARTS.marinades,
  toppings: RECIPE_PARTS.toppings,
};
export const ALL_INGREDIENT_KEYS = [...new Set(Object.values(INGREDIENT_CATEGORIES).flat())];

// Salsas y marinados se porcionan por volumen; lo demás por peso.
export const defaultPortionUnit = (category) => (["sauces", "marinades"].includes(category) ? "ml" : "g");

const normalize = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "");

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const withoutIva = (price) => round2((Number(price) || 0) / (1 + IVA_RATE));

/** Precio de menú (con IVA) de un bowl de una sola proteína. */
export const bowlMenuPrice = (proteinKey, size = "normal") =>
  (size === "large" ? LARGE_BOWL_PRICE : BOWL_PRICE) + (PREMIUM_PROTEIN_PRICES[proteinKey] || 0);

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

/** Rendimiento capturado (1–100%). Sin dato o fuera de rango cuenta como 100%. */
export const proteinYieldOf = (yields, key) => {
  const value = Number(yields?.[key]);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : 100;
};

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
 * Costo por porción de cada complemento. Si el complemento tiene receta
 * estándar (Spicy Surimi, Ensalada de Alga…), su costo por porción manda. Si
 * no, se arma igual que las proteínas: el precio de la unidad (kilo, pieza o
 * paquete) sale del inventario cuando se puede, y quien captura solo dice
 * cuántas porciones rinde esa unidad — que es el dato que el inventario no
 * tiene y nadie más puede saber.
 */
export function resolveComplementCosts(inventoryItems = [], captured = {}, recipeCosts = {}) {
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
    const recipe = Number(recipeCosts?.[key]) || 0;
    byKey[key] = {
      costPerUnit,
      inventoryCostPerUnit: inventoryCost,
      portionsPerUnit: portions,
      unit: match?.unit || null,
      itemName: match?.item || null,
      source: recipe > 0 ? "receta" : manualCost > 0 ? "manual" : inventoryCost > 0 ? "inventario" : "falta",
      costPerPortion: recipe > 0
        ? round2(recipe)
        : costPerUnit > 0 && portions > 0 ? round2(costPerUnit / portions) : 0,
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

/**
 * Costo de una parte del bowl (base, marinados, salsas, toppings) en un bowl
 * promedio. Cada opción pesa según qué tan seguido la piden: las que ya tienen
 * receta estándar usan su costo por porción real, las que todavía no, el costo
 * por porción capturado a mano. Sin ninguna receta (o sin ventas para saber
 * qué piden) queda exactamente como antes: el monto capturado a mano.
 */
export function recipeWeightedCost({ keys, frequency, recipeCosts, fallbackPerServing, fallbackTotal }) {
  const hasRecipe = keys.some((key) => (Number(recipeCosts?.[key]) || 0) > 0);
  const hasUsage = keys.some((key) => (Number(frequency?.[key]) || 0) > 0);
  if (!hasRecipe || !hasUsage) {
    return { cost: round2(fallbackTotal), source: "manual", coveragePct: 0, missing: [] };
  }

  let cost = 0;
  let covered = 0;
  let uncovered = 0;
  const missing = [];
  for (const key of keys) {
    const freq = Number(frequency?.[key]) || 0;
    const recipe = Number(recipeCosts?.[key]) || 0;
    if (freq <= 0) continue;
    if (recipe > 0) {
      cost += recipe * freq;
      covered += freq;
    } else {
      cost += (Number(fallbackPerServing) || 0) * freq;
      uncovered += freq;
      missing.push({ key, frequency: freq });
    }
  }

  return {
    cost: round2(cost),
    source: uncovered > 0 ? "mixto" : "receta",
    // Qué parte de lo que de verdad se sirve ya está costeado con receta.
    coveragePct: round2((covered / (covered + uncovered)) * 100),
    missing: missing.sort((a, b) => b.frequency - a.frequency),
  };
}

/**
 * Costo de los desechables de un bowl promedio. Cada pieza cuesta lo que el
 * paquete ÷ las piezas que trae; luego se pondera por cuándo se usa:
 *   - all:       en todos los bowls,
 *   - togo:      solo en los que se van (para llevar + delivery),
 *   - per_sauce: una pieza por salsa (vasito de aderezo aparte).
 * Las piezas por paquete se leen en vivo del catálogo de Desechables; la copia
 * guardada solo se usa si el artículo ya no existe.
 */
export function disposablesCost(lines = [], catalogById = new Map(), { togoShare = 1, saucesPerBowl = 1 } = {}) {
  let total = 0;
  const detail = lines.map((line) => {
    const item = catalogById.get(String(line.disposableId));
    const piecesPerPack = Number(item?.piecesPerPack) || Number(line.piecesPerPack) || 0;
    const packPrice = Number(line.packPrice) || 0;
    const piecesPerBowl = Number(line.piecesPerBowl) || 0;
    const appliesTo = line.appliesTo || "all";
    const weight = appliesTo === "togo" ? togoShare : appliesTo === "per_sauce" ? saucesPerBowl : 1;
    const piecePrice = piecesPerPack > 0 ? packPrice / piecesPerPack : 0;
    const perBowl = piecePrice * piecesPerBowl * weight;
    total += perBowl;
    return {
      disposableId: String(line.disposableId),
      name: item?.name || line.name || "Desechable",
      category: item?.category || null,
      piecesPerPack,
      packPrice,
      piecesPerBowl,
      appliesTo,
      weight: Math.round(weight * 10000) / 10000,
      piecePrice: Math.round(piecePrice * 10000) / 10000,
      perBowl: round2(perBowl),
      missingFromCatalog: !item,
      missingPrice: packPrice <= 0,
    };
  });
  return { total: round2(total), detail };
}

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

/**
 * Costo por porción de cada opción de un grupo (base, complementos, salsas,
 * marinados o toppings), con este orden:
 *   1. receta estándar con rendimiento (pestaña Recetas),
 *   2. "cuánto lleva una porción" × el precio de compra. El precio sale del
 *      artículo de inventario elegido; si no se eligió, del que empata por
 *      menuKeys o por nombre, y si no hay, del precio capturado a mano. Así
 *      el precio se actualiza solo cada vez que se recibe mercancía.
 *   3. para complementos, el costo por unidad ÷ porciones capturado antes.
 * Lo que falta se explica en palabras (`reason`) para que se pueda completar.
 */
export function resolveIngredientCosts({
  category,
  keys = INGREDIENT_CATEGORIES[category] || [],
  inventoryItems = [],
  portions = {},
  recipeCosts = {},
  recipeStatus = {},
  legacyComplements = null,
}) {
  const byId = new Map(inventoryItems.map((item) => [String(item._id), item]));
  const result = {};

  for (const key of keys) {
    const entry = portions?.[key] || {};
    const portion = { amount: Number(entry.amount) || 0, unit: entry.unit || defaultPortionUnit(category) };
    const content = { contentAmount: Number(entry.contentAmount) || 0, contentUnit: entry.contentUnit || "g" };

    const aliases = INGREDIENT_INVENTORY_ALIASES[key] || [];
    const autoItem = inventoryItems.find((item) => (item.menuKeys || []).includes(key))
      || inventoryItems.find((item) => aliases.includes(normalize(item.item)));
    const explicitItem = entry.inventoryItemId ? byId.get(String(entry.inventoryItemId)) : null;

    const fromItem = (item) => (item && Number(item.cost) > 0
      ? { price: Number(item.cost), unit: item.unit, ...content, source: "inventario", itemId: String(item._id), itemName: item.item }
      : null);
    const manual = Number(entry.price) > 0
      ? { price: Number(entry.price), unit: entry.priceUnit || "kg", ...content, source: "manual" }
      : null;

    const candidates = (explicitItem
      ? [fromItem(explicitItem)]
      : entry.useManualPrice ? [manual] : [fromItem(autoItem), manual]
    ).filter(Boolean);

    let chosen = null;
    let portionCost = 0;
    let reason = null;
    for (const candidate of candidates) {
      const attempt = portionCostOf(portion, candidate);
      if (attempt.cost > 0) { chosen = candidate; portionCost = attempt.cost; reason = null; break; }
      if (!chosen) { chosen = candidate; reason = attempt.reason; }
    }
    if (candidates.length === 0) {
      reason = portion.amount > 0
        ? "Falta el precio de compra."
        : "Falta cuánto lleva una porción y su precio de compra.";
    }

    const recipe = Number(recipeCosts?.[key]) || 0;
    const recipeInfo = recipeStatus?.[key] || null;
    const legacy = Number(legacyComplements?.[key]?.costPerPortion) || 0;
    const legacyFromRecipe = legacyComplements?.[key]?.source === "receta";

    let source = "falta";
    let costPerPortion = 0;
    if (recipe > 0) { source = "receta"; costPerPortion = recipe; reason = null; }
    else if (portionCost > 0) { source = "porcion"; costPerPortion = portionCost; }
    else if (legacy > 0 && !legacyFromRecipe) { source = "porcion"; costPerPortion = legacy; reason = null; }
    else if (recipeInfo?.missingYield) {
      reason = `Falta cuántas porciones rinde la receta "${recipeInfo.name}".`;
    }

    result[key] = {
      key,
      source,
      costPerPortion: round4(costPerPortion),
      reason,
      amount: portion.amount,
      unit: portion.unit,
      price: chosen?.price || 0,
      priceUnit: chosen?.unit || null,
      priceSource: chosen?.source || null,
      itemId: chosen?.itemId || null,
      itemName: chosen?.itemName || null,
      autoItemId: autoItem ? String(autoItem._id) : null,
      autoItemName: autoItem?.item || null,
      recipeId: recipeInfo?.id || null,
      recipeName: recipeInfo?.name || null,
      recipeMissingYield: Boolean(recipeInfo?.missingYield),
      usesOldComplementEntry: source === "porcion" && portionCost <= 0,
    };
  }
  return result;
}

/**
 * Costo de un grupo en un bowl promedio: cada opción pesa según qué tan
 * seguido la piden. Las que todavía no tienen costo se estiman con el
 * promedio de las que sí (mucho más fiel que un monto general escrito a
 * mano); el monto viejo solo se usa si ninguna opción tiene costo todavía.
 * Sin ventas para saber qué piden: promedio conocido × cuántas lleva un bowl.
 */
export function categoryCost({
  keys,
  frequency = {},
  costs = {},
  disabled = new Set(),
  fallbackPerServing = 0,
  fallbackTotal = 0,
  unitsPerBowl = 1,
}) {
  const active = keys.filter((key) => !disabled.has(key));
  const known = active.map((key) => Number(costs?.[key]) || 0).filter((cost) => cost > 0);
  const average = known.length > 0 ? known.reduce((sum, cost) => sum + cost, 0) / known.length : 0;
  const hasUsage = active.some((key) => (Number(frequency?.[key]) || 0) > 0);

  if (!hasUsage) {
    if (average > 0) {
      return { cost: round2(average * unitsPerBowl), source: "estimado", coveragePct: 0, missing: [], estimatePerPortion: round2(average), estimateFrom: "promedio" };
    }
    return { cost: round2(fallbackTotal), source: fallbackTotal > 0 ? "manual" : "falta", coveragePct: 0, missing: [], estimatePerPortion: 0, estimateFrom: null };
  }

  const estimate = average > 0 ? average : Number(fallbackPerServing) || 0;
  let cost = 0;
  let covered = 0;
  let uncovered = 0;
  const missing = [];
  for (const key of active) {
    const freq = Number(frequency?.[key]) || 0;
    if (freq <= 0) continue;
    const own = Number(costs?.[key]) || 0;
    if (own > 0) {
      cost += own * freq;
      covered += freq;
    } else {
      cost += estimate * freq;
      uncovered += freq;
      missing.push({ key, frequency: freq });
    }
  }

  return {
    cost: round2(cost),
    source: uncovered === 0 ? "completo" : covered > 0 ? "mixto" : estimate > 0 ? "manual" : "falta",
    coveragePct: round2((covered / (covered + uncovered)) * 100),
    missing: missing.sort((a, b) => b.frequency - a.frequency),
    estimatePerPortion: uncovered > 0 ? round2(estimate) : 0,
    estimateFrom: uncovered > 0 ? (average > 0 ? "promedio" : estimate > 0 ? "monto viejo" : null) : null,
  };
}

/**
 * Todo lo que cuesta un bowl sin contar la proteína: es igual para cualquier
 * proteína, así que se calcula una vez y se reparte a cada columna.
 */
export function computeSharedParts({
  config,
  usage = null,
  complementCosts = null,
  recipeCosts = {},
  disposableCatalog = new Map(),
  ingredientCosts = null,
}) {
  const freq = usage?.frequencyBy || {};

  // Costo por porción de cada opción. Sin el detalle ya resuelto (pruebas,
  // datos viejos), solo cuentan las recetas y lo capturado por complemento.
  const costsOf = (category) => Object.fromEntries(INGREDIENT_CATEGORIES[category].map((key) => [
    key,
    ingredientCosts?.[category]
      ? Number(ingredientCosts[category][key]?.costPerPortion) || 0
      : category === "complements"
        ? Number(complementCosts?.[key]?.costPerPortion) || 0
        : Number(recipeCosts?.[key]) || 0,
  ]));

  const base = categoryCost({
    keys: RECIPE_PARTS.base,
    frequency: freq.base,
    costs: costsOf("base"),
    // La base se sirve una por bowl: lo capturado por kilo ya es "por porción".
    fallbackPerServing: baseCost(config),
    fallbackTotal: baseCost(config),
    unitsPerBowl: 1,
  });

  const fromParts = (field) => categoryCost({
    keys: RECIPE_PARTS[field],
    frequency: freq[field],
    costs: costsOf(field),
    fallbackPerServing: Number(config?.[field]?.costPerUnit) || 0,
    fallbackTotal: partCost(config?.[field]),
    unitsPerBowl: Number(config?.[field]?.unitsPerBowl) || 1,
  });

  const marinades = fromParts("marinades");
  const sauces = fromParts("sauces");
  const toppings = fromParts("toppings");

  const lines = config?.disposables || [];
  const disposables = disposablesCost(lines, disposableCatalog, {
    togoShare: usage?.bowls > 0 ? usage.togoShare : 1,
    saucesPerBowl: usage?.bowls > 0
      ? Number(usage.averagePerBowl?.sauces) || 0
      : Number(config?.sauces?.unitsPerBowl) || 0,
  });
  const packaging = lines.length > 0
    ? { cost: disposables.total, source: "desglose", detail: disposables.detail }
    : { cost: partCost(config?.packaging), source: "manual", detail: [] };

  const complementsPart = categoryCost({
    keys: COMPLEMENT_KEYS,
    frequency: usage?.bowls > 0 ? usage.frequency : {},
    costs: costsOf("complements"),
    disabled: new Set(config?.disabledComplements || []),
    fallbackPerServing: Number(config?.complements?.costPerUnit) || 0,
    fallbackTotal: partCost(config?.complements),
    unitsPerBowl: Number(config?.complements?.unitsPerBowl) || 4,
  });
  const complements = complementsPart.cost;

  // Un bowl del 2x1 es distinto de uno normal en dos cosas que sí cuestan:
  //   - máximo PROMO_2X1_MAX_COMPLEMENTS complementos: se recorta lo que
  //     pasa del tope según cuántos piden de verdad (complementsCapFactor);
  //   - solo es para comer aquí: no lleva los desechables "para llevar".
  // El empaque capturado como un solo monto no se puede separar y se deja igual.
  const capFactor = usage?.bowls > 0 && Number.isFinite(usage.complementsCapFactor)
    ? usage.complementsCapFactor
    : 1;
  const dineInDisposables = lines.length > 0
    ? disposablesCost(lines, disposableCatalog, {
      togoShare: 0,
      saucesPerBowl: usage?.bowls > 0
        ? Number(usage.averagePerBowl?.sauces) || 0
        : Number(config?.sauces?.unitsPerBowl) || 0,
    }).total
    : packaging.cost;

  return {
    rows: {
      base: base.cost,
      marinades: marinades.cost,
      complements,
      sauces: sauces.cost,
      toppings: toppings.cost,
      packaging: packaging.cost,
    },
    promoRows: {
      complements: round2(complements * capFactor),
      packaging: dineInDisposables,
    },
    detail: { base, marinades, complements: complementsPart, sauces, toppings, packaging },
  };
}

/** Desglose de costo de un bowl con una proteína, igual que la tabla de costeo. */
export function computeBowlCost({ proteinCosts, proteinKey, proteinYields = {}, size = "normal", shared }) {
  const kg = size === "large" ? LARGE_BOWL_PROTEIN_KG : MEDIUM_BOWL_PROTEIN_KG;
  const proteinCostPerKg = proteinCosts?.[proteinKey]?.costPerKg || 0;
  const yieldPct = proteinYieldOf(proteinYields, proteinKey);
  // Lo que de verdad cuesta un kilo servido, ya descontada la merma.
  const usableCostPerKg = round2(proteinCostPerKg / (yieldPct / 100));

  const rows = {
    base: shared.rows.base,
    protein: round2(usableCostPerKg * kg),
    marinades: shared.rows.marinades,
    complements: shared.rows.complements,
    sauces: shared.rows.sauces,
    toppings: shared.rows.toppings,
    packaging: shared.rows.packaging,
  };

  const total = round2(Object.values(rows).reduce((sum, value) => sum + value, 0));
  const menuPrice = bowlMenuPrice(proteinKey, size);
  const price = withoutIva(menuPrice);
  const promoMenuPrice = round2(PROMO_2X1_PRICE / 2);
  const halfMenuPrice = round2(BOWL_PRICE * 0.5);

  // Lo que de verdad cuesta cada bowl del 2x1 (60 g, tope de complementos,
  // para comer aquí). Se calcula también para las proteínas que no entran,
  // para saber cuánto dejarían si entraran.
  const promoRows = {
    ...rows,
    protein: round2(usableCostPerKg * PROMO_2X1_PROTEIN_KG),
    complements: shared.promoRows?.complements ?? rows.complements,
    packaging: shared.promoRows?.packaging ?? rows.packaging,
  };
  const promoTotal = round2(Object.values(promoRows).reduce((sum, value) => sum + value, 0));
  const promoPrice = withoutIva(promoMenuPrice);

  return {
    proteinKey,
    label: PROTEIN_LABELS[proteinKey] || proteinKey,
    proteinKg: kg,
    proteinCostPerKg,
    proteinYieldPct: yieldPct,
    proteinUsableCostPerKg: usableCostPerKg,
    proteinSource: proteinCosts?.[proteinKey]?.source || "falta",
    proteinNote: proteinCosts?.[proteinKey]?.reason || null,
    rows,
    total,
    menuPrice,
    // `price` es lo que le queda al negocio (sin IVA): contra eso se mide todo.
    price,
    iva: round2(menuPrice - price),
    ...marginOf(price, total),
    scenarios: {
      // Cada bowl del 2x1, con su propio costo (más chico que el normal).
      promo2x1: {
        eligible: isPromo2x1Protein(proteinKey),
        proteinKg: PROMO_2X1_PROTEIN_KG,
        rows: promoRows,
        total: promoTotal,
        menuPrice: promoMenuPrice,
        price: promoPrice,
        ...marginOf(promoPrice, promoTotal),
      },
      // El segundo bowl a mitad de precio es un bowl normal: mismo costo.
      halfPriceSecond: { menuPrice: halfMenuPrice, price: withoutIva(halfMenuPrice), ...marginOf(withoutIva(halfMenuPrice), total) },
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

/** Costo del Combo Palace (bowl + bebida + rice cake) contra su precio sin IVA. */
export function computeComboCost({ config, bowlTotal }) {
  const total = round2(bowlTotal + (Number(config.comboDrinkCost) || 0) + (Number(config.comboRiceCakeCost) || 0));
  const price = withoutIva(COMBO_PALACE_PRICE);
  return { total, menuPrice: COMBO_PALACE_PRICE, price, ...marginOf(price, total) };
}

/**
 * Margen real ponderado por lo que de verdad se vende. Un margen "promedio"
 * simple miente cuando el atún (barato) se vende el doble que el salmón (caro):
 * esto pesa cada proteína por sus ventas reales del periodo. Los bowls del 2x1
 * cuentan con su propio costo y precio: contarlos como bowls normales inflaría
 * las dos cosas.
 */
export function weightedMargin(bowls, salesMix, promoMix = {}) {
  let cost = 0;
  let revenue = 0;
  let units = 0;
  let promoUnits = 0;

  for (const bowl of bowls) {
    if (bowl.total <= 0) continue;
    const sold = Number(salesMix?.[bowl.proteinKey]) || 0;
    if (sold > 0) {
      cost += bowl.total * sold;
      revenue += bowl.price * sold;
      units += sold;
    }
    const promoSold = Number(promoMix?.[bowl.proteinKey]) || 0;
    const promo = bowl.scenarios?.promo2x1;
    if (promoSold > 0 && promo) {
      cost += promo.total * promoSold;
      revenue += promo.price * promoSold;
      units += promoSold;
      promoUnits += promoSold;
    }
  }

  if (units === 0) return null;
  return {
    units,
    promoUnits,
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

  if (!bowl.scenarios.promo2x1.eligible) {
    return {
      status: "excluida",
      message: `No entra al 2x1. Si entrara, cada bowl de la promo dejaría ${promoMargin}% de margen.`,
    };
  }

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
