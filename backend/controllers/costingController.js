import BowlCosting from "../models/BowlCosting.js";
import Inventory from "../models/Inventory.js";
import Order from "../models/Order.js";
import {
  COMPLEMENT_KEYS,
  COMPLEMENT_LABELS,
  PROTEIN_KEYS,
  computeBowlCost,
  computeComboCost,
  promoVerdict,
  resolveComplementCosts,
  resolveProteinCosts,
  weightedMargin,
} from "../utils/bowlCosting.js";

const CONFIG_ID = "bowl-costing";
const MIX_WINDOW_DAYS = 30;

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
      for (const bowl of line.bowls || []) fromCart.push({ ...bowl, proteins: line.protein ? [line.protein] : [] });
    }
  }
  if (fromCart.length > 0) return fromCart;
  return order.base || (order.proteins || []).length > 0 ? [order] : [];
};

/**
 * Cuántos bowls de cada proteína se vendieron en el periodo. Se cuenta cada
 * proteína del bowl por separado: un bowl de atún+salmón suma 1 a cada una,
 * que es justo como se reparte su costo.
 */
const loadSalesMix = async (sinceDays = MIX_WINDOW_DAYS) => {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const orders = await Order.find(
    { createdAt: { $gte: since }, status: { $ne: "cancelled" } },
    { proteins: 1, base: 1, cartItems: 1 }
  ).lean();

  const mix = {};
  const bump = (key) => {
    if (PROTEIN_KEYS.includes(key)) mix[key] = (mix[key] || 0) + 1;
  };

  for (const order of orders) {
    for (const bowl of bowlsOf(order)) (bowl.proteins || []).forEach(bump);
    // Los bowls de venta rápida no traen receta, pero sí la proteína capturada.
    for (const line of order.cartItems || []) {
      if (line.kind === "item" && line.protein) bump(line.protein);
    }
  }
  return mix;
};

/**
 * Qué tan seguido entra cada complemento a un bowl, y cuántos elementos de
 * cada categoría lleva un bowl en promedio. Sirve para dos cosas: ponderar el
 * costo de complementos, y enseñarle a quien captura cuál es la cantidad real
 * (el límite gratis son 6 complementos, pero la gente usa ~3.8).
 */
const loadComplementUsage = async (sinceDays = 60) => {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const orders = await Order.find(
    { createdAt: { $gte: since }, status: { $ne: "cancelled" } },
    { complements: 1, sauces: 1, toppings: 1, marinades: 1, base: 1, proteins: 1, cartItems: 1 }
  ).lean();

  const counts = {};
  const totals = { complements: 0, sauces: 0, toppings: 0, marinades: 0 };
  let bowls = 0;

  for (const order of orders) {
    for (const bowl of bowlsOf(order)) {
      bowls += 1;
      for (const key of bowl.complements || []) counts[key] = (counts[key] || 0) + 1;
      for (const field of ["complements", "sauces", "toppings", "marinades"]) {
        totals[field] += (bowl[field] || []).length;
      }
    }
  }

  const safeBowls = Math.max(bowls, 1);
  return {
    bowls,
    windowDays: sinceDays,
    frequency: Object.fromEntries(
      COMPLEMENT_KEYS.map((key) => [key, Number(((counts[key] || 0) / safeBowls).toFixed(4))])
    ),
    averagePerBowl: Object.fromEntries(
      Object.entries(totals).map(([field, sum]) => [field, Number((sum / safeBowls).toFixed(2))])
    ),
  };
};

const buildReport = async (config) => {
  const [inventoryItems, salesMix, complementUsage] = await Promise.all([
    Inventory.find({}, { item: 1, unit: 1, cost: 1, menuKeys: 1 }).lean(),
    loadSalesMix(),
    loadComplementUsage(),
  ]);

  const proteinCosts = resolveProteinCosts(
    inventoryItems,
    Object.fromEntries(config.proteinCostPerKgOverride || [])
  );

  const capturedComplements = Object.fromEntries(
    [...(config.complementCosts || [])].map(([key, value]) => [
      key,
      { costPerUnit: value?.costPerUnit || 0, portionsPerUnit: value?.portionsPerUnit || 0 },
    ])
  );
  const complementCosts = resolveComplementCosts(inventoryItems, capturedComplements);

  const bowls = PROTEIN_KEYS.map((proteinKey) => {
    const bowl = computeBowlCost({ config, proteinCosts, proteinKey, complementUsage, complementCosts });
    return { ...bowl, verdict: promoVerdict(bowl, config), sold30d: salesMix[proteinKey] || 0 };
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
      complementCosts: capturedComplements,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
    },
    bowls,
    combo: topBowl ? { ...computeComboCost({ config, bowlTotal: topBowl.total }), basedOn: topBowl.label } : null,
    weighted: weightedMargin(bowls, salesMix),
    salesMixWindowDays: MIX_WINDOW_DAYS,
    complementUsage: {
      ...complementUsage,
      labels: COMPLEMENT_LABELS,
      keys: COMPLEMENT_KEYS,
    },
    complementCosts,
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

    config.updatedBy = req.staff?.name || null;
    await config.save();

    res.json(await buildReport(config));
  } catch (err) {
    console.error("updateCosting error:", err);
    res.status(500).json({ msg: "No se pudo guardar el costeo" });
  }
};
