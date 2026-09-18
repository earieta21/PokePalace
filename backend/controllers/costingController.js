import BowlCosting from "../models/BowlCosting.js";
import Inventory from "../models/Inventory.js";
import Order from "../models/Order.js";
import {
  PROTEIN_KEYS,
  computeBowlCost,
  computeComboCost,
  promoVerdict,
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
 * Cuántos bowls de cada proteína se vendieron en el periodo. Se cuenta cada
 * proteína del bowl por separado: un bowl de atún+salmón suma 1 a cada una,
 * que es justo como se reparte su costo.
 */
const loadSalesMix = async (sinceDays = MIX_WINDOW_DAYS) => {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const orders = await Order.find(
    { createdAt: { $gte: since }, status: { $ne: "cancelled" } },
    { proteins: 1, cartItems: 1 }
  ).lean();

  const mix = {};
  const bump = (key) => {
    if (PROTEIN_KEYS.includes(key)) mix[key] = (mix[key] || 0) + 1;
  };

  for (const order of orders) {
    (order.proteins || []).forEach(bump);
    for (const line of order.cartItems || []) {
      if (line.kind === "bowl") (line.proteins || []).forEach(bump);
      if (line.kind === "promo2x1") (line.bowls || []).forEach(() => bump(line.protein));
      if (line.protein) bump(line.protein);
    }
  }
  return mix;
};

const buildReport = async (config) => {
  const [inventoryItems, salesMix] = await Promise.all([
    Inventory.find({}, { item: 1, unit: 1, cost: 1, menuKeys: 1 }).lean(),
    loadSalesMix(),
  ]);

  const proteinCosts = resolveProteinCosts(
    inventoryItems,
    Object.fromEntries(config.proteinCostPerKgOverride || [])
  );

  const bowls = PROTEIN_KEYS.map((proteinKey) => {
    const bowl = computeBowlCost({ config, proteinCosts, proteinKey });
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
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
    },
    bowls,
    combo: topBowl ? { ...computeComboCost({ config, bowlTotal: topBowl.total }), basedOn: topBowl.label } : null,
    weighted: weightedMargin(bowls, salesMix),
    salesMixWindowDays: MIX_WINDOW_DAYS,
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
