import mongoose from "mongoose";
import BowlCosting from "../models/BowlCosting.js";
import Disposable from "../models/Disposable.js";
import Inventory from "../models/Inventory.js";
import Order from "../models/Order.js";
import Preparation from "../models/Preparation.js";
import {
  ALL_INGREDIENT_KEYS,
  COMPLEMENT_KEYS,
  COMPLEMENT_LABELS,
  INGREDIENT_CATEGORIES,
  IVA_RATE,
  PROTEIN_KEYS,
  PROTEIN_LABELS,
  RECIPE_PARTS,
  computeBowlCost,
  computeComboCost,
  computeSharedParts,
  promoVerdict,
  resolveComplementCosts,
  resolveIngredientCosts,
  resolveProteinCosts,
  weightedMargin,
} from "../utils/bowlCosting.js";
import { preparationCost, withLivePrices } from "../utils/preparationCost.js";
import { PORTION_UNITS, PURCHASE_UNITS } from "../utils/portionCost.js";
import {
  TEMPLATE_DISPOSABLES,
  TEMPLATE_PORTIONS,
  TEMPLATE_RECIPES,
  planCostingTemplate,
} from "../config/costingTemplate.js";
import { PROMO_2X1_MAX_COMPLEMENTS } from "../pricing.js";

const CONFIG_ID = "bowl-costing";
const MIX_WINDOW_DAYS = 30;
const MAX_DISPOSABLE_LINES = 30;
const APPLIES_TO = ["all", "togo", "per_sauce"];

const loadConfig = async () => {
  const existing = await BowlCosting.findById(CONFIG_ID);
  if (existing) return existing;
  return BowlCosting.create({ _id: CONFIG_ID });
};

/**
 * Los bowls de un pedido, sin contarlos dos veces: un pedido de un solo bowl
 * guarda el mismo bowl arriba (campos planos, por compatibilidad) Y dentro de
 * cartItems. Si el carrito trae bowls, ese es el dato bueno; el de arriba solo
 * se usa cuando no hay carrito.
 */
const bowlsOf = (order) => {
  const fromCart = [];
  for (const line of order.cartItems || []) {
    if (line.kind === "bowl") fromCart.push(line);
    if (line.kind === "promo2x1") {
      // Los bowls de la promo comparten la proteína de la línea.
      for (const bowl of line.bowls || []) {
        fromCart.push({ ...bowl, proteins: line.protein ? [line.protein] : [], promo2x1: true });
      }
    }
  }
  if (fromCart.length > 0) return fromCart;
  return order.base || (order.proteins || []).length > 0 ? [order] : [];
};

const POS_PROMO_2X1_ID = "promo-2x1-dinein";

/**
 * Cuántos bowls de cada proteína se vendieron en el periodo. Se cuenta cada
 * proteína del bowl por separado: un bowl de atún+salmón suma 1 a cada una,
 * que es justo como se reparte su costo. Los bowls del 2x1 van aparte
 * (`promoMix`) porque cuestan y se cobran distinto.
 */
const loadSalesMix = async (sinceDays = MIX_WINDOW_DAYS) => {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const orders = await Order.find(
    { createdAt: { $gte: since }, status: { $ne: "cancelled" } },
    { proteins: 1, base: 1, cartItems: 1, items: 1 }
  ).lean();

  const mix = {};
  const promoMix = {};
  const bump = (target, key, count = 1) => {
    if (PROTEIN_KEYS.includes(key)) target[key] = (target[key] || 0) + count;
  };
  // Venta rápida (caja o artículo del carrito): no trae receta, pero sí la
  // proteína capturada. La 2x1 de caja son 2 bowls por cada una cobrada.
  const bumpQuickSale = (line) => {
    // El extra de proteína trae proteína pero no es un bowl.
    if (line.catalogId === "extra-protein-scoop") return;
    const qty = Math.max(1, Number(line.qty) || 1);
    const isPromo = line.catalogId === POS_PROMO_2X1_ID;
    const target = isPromo ? promoMix : mix;
    const proteins = (line.proteins || []).length > 0 ? line.proteins : line.protein ? [line.protein] : [];
    for (const key of proteins) bump(target, key, isPromo ? qty * 2 : qty);
  };

  for (const order of orders) {
    for (const bowl of bowlsOf(order)) {
      for (const key of bowl.proteins || []) bump(bowl.promo2x1 ? promoMix : mix, key);
    }
    for (const line of order.cartItems || []) {
      if (line.kind === "item") bumpQuickSale(line);
    }
    for (const item of order.items || []) bumpQuickSale(item);
  }
  return { mix, promoMix };
};

const ratio = (count, total) => Number(((count || 0) / Math.max(total, 1)).toFixed(4));

/**
 * Qué tan seguido entra cada opción a un bowl, cuántos elementos de cada
 * categoría lleva un bowl en promedio, y qué parte de los bowls se va (para
 * llevar o delivery). Sirve para ponderar el costo de cada parte por lo que
 * de verdad se sirve, y para enseñarle a quien captura la cantidad real (el
 * límite gratis son 6 complementos, pero la gente usa ~3.8).
 */
const loadBowlUsage = async (sinceDays = 60) => {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const orders = await Order.find(
    { createdAt: { $gte: since }, status: { $ne: "cancelled" } },
    {
      complements: 1, sauces: 1, toppings: 1, marinades: 1, base: 1, bases: 1,
      proteins: 1, cartItems: 1, fulfillment: 1,
    }
  ).lean();

  const counts = { base: {}, complements: {}, marinades: {}, sauces: {}, toppings: {} };
  const totals = { complements: 0, sauces: 0, toppings: 0, marinades: 0 };
  const fulfillment = { pickup: 0, dine_in: 0, delivery: 0 };
  let bowls = 0;
  let servedBases = 0;
  // Cuántos complementos quedarían si cada bowl tuviera el tope del 2x1.
  let cappedComplements = 0;

  for (const order of orders) {
    const type = fulfillment[order.fulfillment] !== undefined ? order.fulfillment : "pickup";
    for (const bowl of bowlsOf(order)) {
      bowls += 1;
      fulfillment[type] += 1;

      // "Mitad y mitad" sirve media porción de cada base, no una de cada una.
      const bases = (bowl.bases || []).length > 0 ? bowl.bases : bowl.base ? [bowl.base] : [];
      for (const key of bases) counts.base[key] = (counts.base[key] || 0) + 1 / bases.length;
      if (bases.length > 0) servedBases += 1;

      for (const field of ["complements", "marinades", "sauces", "toppings"]) {
        for (const key of bowl[field] || []) counts[field][key] = (counts[field][key] || 0) + 1;
        totals[field] += (bowl[field] || []).length;
      }
      cappedComplements += Math.min((bowl.complements || []).length, PROMO_2X1_MAX_COMPLEMENTS);
    }
  }

  const frequencyBy = {
    // Todo bowl lleva base: se reparte entre los que sí la registraron, para
    // que un pedido viejo sin base no haga ver la base más barata.
    base: Object.fromEntries(RECIPE_PARTS.base.map((key) => [key, ratio(counts.base[key], servedBases)])),
    ...Object.fromEntries(["marinades", "sauces", "toppings"].map((field) => [
      field,
      Object.fromEntries(RECIPE_PARTS[field].map((key) => [key, ratio(counts[field][key], bowls)])),
    ])),
  };

  return {
    bowls,
    windowDays: sinceDays,
    frequency: Object.fromEntries(COMPLEMENT_KEYS.map((key) => [key, ratio(counts.complements[key], bowls)])),
    frequencyBy,
    averagePerBowl: Object.fromEntries(
      Object.entries(totals).map(([field, sum]) => [field, Number((sum / Math.max(bowls, 1)).toFixed(2))])
    ),
    fulfillment,
    // Los que salen del local llevan bolsa, cubiertos, etc.
    togoShare: ratio(fulfillment.pickup + fulfillment.delivery, bowls),
    // Qué parte del costo de complementos se queda en un bowl del 2x1 (tope de
    // PROMO_2X1_MAX_COMPLEMENTS): quien pide 6 se queda con 4.
    complementsCapFactor: totals.complements > 0 ? ratio(cappedComplements, totals.complements) : 1,
  };
};

/**
 * Costo por porción de cada receta estándar amarrada a algo del menú, con los
 * precios del inventario en vivo — el mismo número que enseña la pestaña
 * Recetas. Si hubiera dos recetas para lo mismo, gana la más reciente.
 */
const loadRecipeCosts = async (inventoryItems) => {
  const preps = await Preparation.find({ menuKey: { $ne: null } }).sort({ updatedAt: 1 }).lean();
  const inventoryById = new Map(inventoryItems.map((item) => [String(item._id), item]));

  const costs = {};
  const status = {};
  for (const prep of preps) {
    const cost = preparationCost(withLivePrices(prep, inventoryById));
    status[prep.menuKey] = {
      id: String(prep._id),
      name: prep.name,
      costPerPortion: cost.costPerPortion,
      // Una receta sin rendimiento solo sabe lo que cuesta el lote: no sirve
      // para el bowl todavía, y hay que decirlo para que no se quede así.
      missingYield: cost.missingYield,
    };
    if (cost.costPerPortion > 0) costs[prep.menuKey] = cost.costPerPortion;
    else delete costs[prep.menuKey];
  }
  return { costs, status };
};

const portionsOf = (config) => Object.fromEntries(
  [...(config.portions || [])].map(([key, entry]) => [key, {
    amount: Number(entry?.amount) || 0,
    unit: entry?.unit || "g",
    inventoryItemId: entry?.inventoryItemId ? String(entry.inventoryItemId) : null,
    price: Number(entry?.price) || 0,
    priceUnit: entry?.priceUnit || "kg",
    useManualPrice: Boolean(entry?.useManualPrice),
    contentAmount: Number(entry?.contentAmount) || 0,
    contentUnit: entry?.contentUnit || "g",
  }])
);

const CONTENT_UNITS = ["g", "ml", "kg", "l"];
const boundedNumber = (value, max) => Math.min(max, Math.max(0, Number(value) || 0));

/** Limpia una porción capturada. Regresa null si viene vacía (se borra). */
export function cleanPortion(raw) {
  if (!raw || typeof raw !== "object") return null;
  const entry = {
    amount: boundedNumber(raw.amount, 5000),
    unit: PORTION_UNITS.includes(raw.unit) ? raw.unit : "g",
    inventoryItemId: raw.inventoryItemId && mongoose.isValidObjectId(raw.inventoryItemId) ? String(raw.inventoryItemId) : null,
    price: boundedNumber(raw.price, 100000),
    priceUnit: PURCHASE_UNITS.includes(raw.priceUnit) ? raw.priceUnit : "kg",
    useManualPrice: raw.useManualPrice === true,
    contentAmount: boundedNumber(raw.contentAmount, 100000),
    contentUnit: CONTENT_UNITS.includes(raw.contentUnit) ? raw.contentUnit : "g",
  };
  const empty = entry.amount === 0 && entry.price === 0 && !entry.inventoryItemId;
  return empty ? null : entry;
}

const disposableLinesOf = (config) => (config.disposables || []).map((line) => ({
  disposableId: String(line.disposableId),
  name: line.name,
  piecesPerPack: line.piecesPerPack,
  packPrice: line.packPrice,
  piecesPerBowl: line.piecesPerBowl,
  appliesTo: line.appliesTo,
}));

const buildReport = async (config) => {
  const [inventoryItems, { mix: salesMix, promoMix }, usage, disposableItems] = await Promise.all([
    Inventory.find({}, { item: 1, unit: 1, cost: 1, menuKeys: 1 }).lean(),
    loadSalesMix(),
    loadBowlUsage(),
    Disposable.find({}, { name: 1, category: 1, piecesPerPack: 1 }).sort({ category: 1, name: 1 }).lean(),
  ]);
  const recipes = await loadRecipeCosts(inventoryItems);

  const proteinCosts = resolveProteinCosts(
    inventoryItems,
    Object.fromEntries(config.proteinCostPerKgOverride || [])
  );
  const proteinYields = Object.fromEntries(config.proteinYieldPct || []);

  const capturedComplements = Object.fromEntries(
    [...(config.complementCosts || [])].map(([key, value]) => [
      key,
      { costPerUnit: value?.costPerUnit || 0, portionsPerUnit: value?.portionsPerUnit || 0 },
    ])
  );
  const complementCosts = resolveComplementCosts(inventoryItems, capturedComplements, recipes.costs);

  // Cuánto lleva una porción de cada opción × su precio de compra.
  const portions = portionsOf(config);
  const ingredientCosts = Object.fromEntries(Object.keys(INGREDIENT_CATEGORIES).map((category) => [
    category,
    resolveIngredientCosts({
      category,
      inventoryItems,
      portions,
      recipeCosts: recipes.costs,
      recipeStatus: recipes.status,
      legacyComplements: category === "complements" ? complementCosts : null,
    }),
  ]));
  const disabledProteins = new Set(config.disabledProteins || []);
  const disabledComplements = new Set(config.disabledComplements || []);

  const disposableCatalog = new Map(disposableItems.map((item) => [String(item._id), item]));
  const shared = computeSharedParts({
    config,
    usage: usage.bowls > 0 ? usage : null,
    complementCosts,
    recipeCosts: recipes.costs,
    disposableCatalog,
    ingredientCosts,
  });

  const bowls = PROTEIN_KEYS.filter((key) => !disabledProteins.has(key)).map((proteinKey) => {
    const bowl = computeBowlCost({ proteinCosts, proteinKey, proteinYields, shared });
    return {
      ...bowl,
      verdict: promoVerdict(bowl, config),
      sold30d: salesMix[proteinKey] || 0,
      soldPromo30d: promoMix[proteinKey] || 0,
    };
  });

  // El combo se costea sobre la proteína más vendida: es el costo que de
  // verdad se está incurriendo, no un promedio teórico.
  const topBowl = [...bowls].sort((a, b) => b.sold30d - a.sold30d)[0];

  return {
    config: {
      base: config.base,
      baseCostPerKg: config.baseCostPerKg,
      baseGramsPerPortion: config.baseGramsPerPortion,
      marinades: config.marinades,
      complements: config.complements,
      sauces: config.sauces,
      toppings: config.toppings,
      packaging: config.packaging,
      comboDrinkCost: config.comboDrinkCost,
      comboRiceCakeCost: config.comboRiceCakeCost,
      promoMinMarginPct: config.promoMinMarginPct,
      promoEligibleMinMarginPct: config.promoEligibleMinMarginPct,
      proteinCostPerKgOverride: Object.fromEntries(config.proteinCostPerKgOverride || []),
      proteinYieldPct: proteinYields,
      complementCosts: capturedComplements,
      portions,
      disposables: disposableLinesOf(config),
      disabledProteins: [...disabledProteins],
      disabledComplements: [...disabledComplements],
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
    },
    ivaRate: IVA_RATE,
    bowls,
    // Cómo se armó cada fila que no depende de la proteína (receta, mixto o
    // a mano; qué falta), para que la pantalla diga qué tan fiel es el número.
    parts: shared.detail,
    recipeStatus: recipes.status,
    recipeKeys: RECIPE_PARTS,
    disposableCatalog: disposableItems.map((item) => ({
      id: String(item._id),
      name: item.name,
      category: item.category,
      piecesPerPack: item.piecesPerPack,
    })),
    combo: topBowl ? { ...computeComboCost({ config, bowlTotal: topBowl.total }), basedOn: topBowl.label } : null,
    weighted: weightedMargin(bowls, salesMix, promoMix),
    salesMixWindowDays: MIX_WINDOW_DAYS,
    complementUsage: {
      ...usage,
      labels: COMPLEMENT_LABELS,
      // Solo los que sí se manejan entran a la captura y al costo ponderado.
      keys: COMPLEMENT_KEYS.filter((key) => !disabledComplements.has(key)),
      allKeys: COMPLEMENT_KEYS,
    },
    proteinLabels: Object.fromEntries(PROTEIN_KEYS.map((key) => [key, PROTEIN_LABELS[key]])),
    complementCosts,
    // Cada opción del menú con su porción, su precio y qué tan seguido se pide,
    // en el orden de la pantalla.
    ingredients: Object.fromEntries(Object.entries(INGREDIENT_CATEGORIES).map(([category, keys]) => [
      category,
      keys
        .filter((key) => category !== "complements" || !disabledComplements.has(key))
        .map((key) => ({
          ...ingredientCosts[category][key],
          frequency: category === "complements"
            ? Number(usage.frequency?.[key]) || 0
            : Number(usage.frequencyBy?.[category]?.[key]) || 0,
        })),
    ])),
    // Para elegir de qué artículo sale el precio de cada porción.
    inventoryOptions: inventoryItems
      .map((item) => ({ id: String(item._id), item: item.item, unit: item.unit, cost: Number(item.cost) || 0 }))
      .sort((a, b) => a.item.localeCompare(b.item, "es")),
  };
};

export const getCosting = async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(await buildReport(config));
  } catch (err) {
    console.error("getCosting error:", err);
    res.status(500).json({ msg: "No se pudo cargar el costeo" });
  }
};

const PART_FIELDS = ["base", "marinades", "complements", "sauces", "toppings", "packaging"];

const cleanPart = (input, fallback) => ({
  costPerUnit: Math.max(0, Number(input?.costPerUnit ?? fallback.costPerUnit) || 0),
  unitsPerBowl: Math.max(0, Number(input?.unitsPerBowl ?? fallback.unitsPerBowl) || 0),
});

export const updateCosting = async (req, res) => {
  try {
    const config = await loadConfig();

    for (const field of PART_FIELDS) {
      if (req.body?.[field]) config[field] = cleanPart(req.body[field], config[field]);
    }

    for (const field of ["baseCostPerKg", "baseGramsPerPortion", "comboDrinkCost", "comboRiceCakeCost"]) {
      if (req.body?.[field] !== undefined) {
        config[field] = Math.max(0, Number(req.body[field]) || 0);
      }
    }

    for (const field of ["promoMinMarginPct", "promoEligibleMinMarginPct"]) {
      if (req.body?.[field] !== undefined) {
        const value = Number(req.body[field]);
        if (Number.isFinite(value)) config[field] = Math.min(100, Math.max(0, value));
      }
    }

    for (const [field, allowed] of [["disabledProteins", PROTEIN_KEYS], ["disabledComplements", COMPLEMENT_KEYS]]) {
      if (Array.isArray(req.body?.[field])) {
        config[field] = req.body[field].filter((key) => allowed.includes(key));
      }
    }

    if (req.body?.complementCosts && typeof req.body.complementCosts === "object") {
      for (const key of COMPLEMENT_KEYS) {
        const raw = req.body.complementCosts[key];
        if (raw === null || raw === undefined) continue;
        const costPerUnit = Math.max(0, Number(raw.costPerUnit) || 0);
        const portionsPerUnit = Math.max(0, Number(raw.portionsPerUnit) || 0);
        if (costPerUnit === 0 && portionsPerUnit === 0) {
          config.complementCosts.delete(key);
        } else {
          config.complementCosts.set(key, { costPerUnit, portionsPerUnit });
        }
      }
    }

    if (req.body?.portions && typeof req.body.portions === "object") {
      const allowed = new Set(ALL_INGREDIENT_KEYS);
      for (const [key, raw] of Object.entries(req.body.portions)) {
        if (!allowed.has(key)) continue;
        const entry = cleanPortion(raw);
        if (entry) config.portions.set(key, entry);
        else config.portions.delete(key);
      }
    }

    if (req.body?.proteinCostPerKgOverride && typeof req.body.proteinCostPerKgOverride === "object") {
      for (const key of PROTEIN_KEYS) {
        const raw = req.body.proteinCostPerKgOverride[key];
        if (raw === "" || raw === null) {
          config.proteinCostPerKgOverride.delete(key);
        } else if (raw !== undefined) {
          const value = Number(raw);
          if (Number.isFinite(value) && value >= 0) config.proteinCostPerKgOverride.set(key, value);
        }
      }
    }

    if (req.body?.proteinYieldPct && typeof req.body.proteinYieldPct === "object") {
      for (const key of PROTEIN_KEYS) {
        const raw = req.body.proteinYieldPct[key];
        if (raw === undefined) continue;
        const value = Number(raw);
        // Vacío = "no se ha medido". Un 100 sí se guarda: es un dato medido
        // (tofu, camarón ya cocido) y la pantalla lo cuenta como capturado.
        if (raw === "" || raw === null) {
          config.proteinYieldPct.delete(key);
        } else if (!Number.isFinite(value) || value < 20 || value > 100) {
          return res.status(400).json({
            msg: `El rendimiento de ${PROTEIN_LABELS[key]} debe estar entre 20% y 100%`,
          });
        } else {
          config.proteinYieldPct.set(key, Math.round(value * 10) / 10);
        }
      }
    }

    if (Array.isArray(req.body?.disposables)) {
      const lines = req.body.disposables.slice(0, MAX_DISPOSABLE_LINES);
      const ids = lines.map((line) => String(line?.disposableId || ""));
      if (ids.some((id) => !mongoose.isValidObjectId(id))) {
        return res.status(400).json({ msg: "Elige el desechable en cada renglón" });
      }
      const catalog = new Map(
        (await Disposable.find({ _id: { $in: ids } }, { name: 1, piecesPerPack: 1 }).lean())
          .map((item) => [String(item._id), item])
      );
      // Un renglón cuyo artículo ya se borró del catálogo se conserva con su
      // copia guardada; uno que nunca existió es un error de captura.
      const previous = new Map((config.disposables || []).map((line) => [String(line.disposableId), line]));

      const seen = new Set();
      const clean = [];
      for (const line of lines) {
        const id = String(line.disposableId);
        if (seen.has(id)) continue;
        seen.add(id);
        const item = catalog.get(id) || previous.get(id);
        if (!item) return res.status(400).json({ msg: "Ese desechable ya no existe en el catálogo" });
        clean.push({
          disposableId: id,
          name: item.name,
          piecesPerPack: Number(item.piecesPerPack) || 0,
          packPrice: Math.max(0, Number(line.packPrice) || 0),
          piecesPerBowl: Math.min(20, Math.max(0, Number(line.piecesPerBowl) || 0)),
          appliesTo: APPLIES_TO.includes(line.appliesTo) ? line.appliesTo : "all",
        });
      }
      config.disposables = clean;
    }

    config.updatedBy = req.staff?.name || null;
    await config.save();

    res.json(await buildReport(config));
  } catch (err) {
    console.error("updateCosting error:", err);
    res.status(500).json({ msg: "No se pudo guardar el costeo" });
  }
};

/* ---------- Plantilla de la hoja de insumos ---------- */

const templateState = async (config) => {
  const [preparations, disposables] = await Promise.all([
    Preparation.find({ menuKey: { $ne: null } }, { menuKey: 1 }).lean(),
    Disposable.find({}, { name: 1 }).lean(),
  ]);
  return { preparations, portions: portionsOf(config), disposables, lines: config.disposables || [] };
};

/* GET /api/staff/costing/template — qué cargaría, sin tocar nada. */
export const previewCostingTemplate = async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(planCostingTemplate(await templateState(config)));
  } catch (err) {
    console.error("previewCostingTemplate error:", err);
    res.status(500).json({ msg: "No se pudo revisar la plantilla" });
  }
};

/* POST /api/staff/costing/template — carga solo lo que falta. Nunca
   sobrescribe una receta, una porción ni un desechable ya capturado. */
export const applyCostingTemplate = async (req, res) => {
  try {
    const config = await loadConfig();
    const plan = planCostingTemplate(await templateState(config));
    const staffName = req.staff?.name || null;

    for (const recipe of TEMPLATE_RECIPES) {
      const step = plan.recipes.find((entry) => entry.menuKey === recipe.menuKey);
      if (step?.action !== "crear") continue;
      await Preparation.create({ ...recipe, yieldPortions: 0, updatedBy: staffName });
    }

    for (const step of plan.portions) {
      if (step.action !== "crear") continue;
      const entry = cleanPortion(TEMPLATE_PORTIONS[step.key]);
      if (entry) config.portions.set(step.key, entry);
    }

    for (const template of TEMPLATE_DISPOSABLES) {
      const step = plan.disposables.find((entry) => entry.name === template.name);
      if (!step || step.action === "existe") continue;
      let id = step.existingId;
      let piecesPerPack = template.piecesPerPack;
      if (!id) {
        const created = await Disposable.create({
          name: template.name,
          category: template.category,
          piecesPerPack: template.piecesPerPack,
          pieces: 0,
        });
        id = String(created._id);
      } else {
        piecesPerPack = (await Disposable.findById(id, { piecesPerPack: 1 }).lean())?.piecesPerPack || piecesPerPack;
      }
      if ((config.disposables || []).length >= MAX_DISPOSABLE_LINES) break;
      config.disposables.push({
        disposableId: id,
        name: step.existingName || template.name,
        piecesPerPack,
        packPrice: template.packPrice,
        piecesPerBowl: 1,
        appliesTo: template.appliesTo,
      });
    }

    config.updatedBy = staffName;
    await config.save();
    res.json(await buildReport(config));
  } catch (err) {
    console.error("applyCostingTemplate error:", err);
    res.status(500).json({ msg: "No se pudo cargar la plantilla" });
  }
};
