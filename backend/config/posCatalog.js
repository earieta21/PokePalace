// Source of truth for products sold through the POS. The browser may display
// these prices, but only this server-side catalog is used to charge an order.
export const POS_CATALOG = Object.freeze([
  // Los 4 bowls de la casa — mismos nombres y recetas que los presets del
  // inicio del sitio (src/order/OrderPage.jsx PRESETS), todos a precio de
  // bowl normal.
  {
    catalogId: "bowl-emerald-salmon", legacyId: 1, name: "Bowl de salmón esmeralda", price: 249, category: "bowls",
    inventoryRecipe: {
      white_rice: 1, salmon: 1, tuna: 1, shoyu_marinade: 1,
      avocado: 1, cucumber: 1, edamame: 1,
      spicy_mayo: 1, soy_sauce: 1, sesame_seeds: 1, nori_strips: 1,
    },
  },
  {
    catalogId: "bowl-spicy-tuna", legacyId: 2, name: "Bowl picante de atún crujiente", price: 249, category: "bowls",
    inventoryRecipe: {
      brown_rice: 1, tuna: 1, seared_tuna: 1, spicy_marinade: 1,
      cucumber: 1, edamame: 1, corn: 1,
      garlic_sriracha: 1, spicy_mayo: 1, red_pepper_flakes: 1, furikake: 1,
    },
  },
  {
    catalogId: "bowl-tropical-shrimp", legacyId: 3, name: "Bowl tropical de camarón", price: 249, category: "bowls",
    inventoryRecipe: {
      spring_mix: 1, shrimp: 1, salmon: 1, citrus_marinade: 1,
      mango: 1, pineapple: 1, avocado: 1,
      sweet_chili: 1, avocado_lime: 1, sesame_seeds: 1, crispy_onions: 1,
    },
  },
  {
    catalogId: "bowl-citrus-octopus", legacyId: 4, name: "Pulpo cítrico", price: 249, category: "bowls",
    inventoryRecipe: {
      spring_mix: 1, octopus: 1, shrimp: 1, citrus_marinade: 1,
      cucumber: 1, mango: 1, avocado: 1,
      avocado_lime: 1, soy_sauce: 1, sesame_seeds: 1, nori_strips: 1,
    },
  },
  {
    catalogId: "edamame", legacyId: 6, name: "Edamame", price: 69, category: "starters",
    inventoryRecipe: { edamame: 1 },
  },
  {
    catalogId: "seaweed-salad", legacyId: 8, name: "Ensalada de Algas", price: 79, category: "starters",
    inventoryRecipe: { ensalada_de_algas: 1 },
  },
  {
    // Mantiene catalogId/legacyId de "Agua Mineral" para que las órdenes
    // históricas y colas offline sigan resolviendo al mismo producto.
    catalogId: "mineral-water", legacyId: 11, name: "Topochico", price: 35, category: "drinks",
    inventoryRecipe: { topochico: 1 },
  },
  {
    catalogId: "coca-zero", legacyId: 13, name: "Coca-Zero", price: 30, category: "drinks",
    inventoryRecipe: { coca_zero: 1 },
  },
  {
    catalogId: "bottled-water", legacyId: 14, name: "Botella de Agua", price: 20, category: "drinks",
    inventoryRecipe: { botella_de_agua: 1 },
  },
  {
    catalogId: "agua-del-dia", legacyId: 15, name: "Agua natural del día", price: 30, category: "drinks", rewardDrink: true,
    inventoryRecipe: { agua_natural: 1 },
  },
]);

const normalizeName = (value) => String(value || "").normalize("NFKC").trim().toLocaleLowerCase("es-MX");

const BY_CATALOG_ID = new Map(POS_CATALOG.map((item) => [item.catalogId, item]));
const BY_LEGACY_ID = new Map(POS_CATALOG.map((item) => [String(item.legacyId), item]));
const BY_NAME = new Map(POS_CATALOG.map((item) => [normalizeName(item.name), item]));

export class PosOrderValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PosOrderValidationError";
  }
}

export const getPosCatalogItem = (identifier) => {
  if (identifier === undefined || identifier === null || identifier === "") return null;
  const key = String(identifier).trim();
  return BY_CATALOG_ID.get(key) || BY_LEGACY_ID.get(key) || null;
};

export const normalizePosClientOrderId = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const clean = String(value).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/.test(clean)) {
    throw new PosOrderValidationError("clientOrderId no es válido");
  }
  return clean;
};

// Legacy POS builds sent { name, price, qty } without an id. Exact canonical
// names remain accepted so queued orders keep working, but submitted prices
// are deliberately ignored in every case.
export const resolvePosItems = (items) => {
  if (!Array.isArray(items)) throw new PosOrderValidationError("La lista de productos no es válida");
  if (items.length > 50) throw new PosOrderValidationError("La orden contiene demasiados productos");

  const resolved = new Map();
  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      throw new PosOrderValidationError("Hay un producto inválido en la orden");
    }

    const hasIdentifier = rawItem.catalogId !== undefined || rawItem.id !== undefined;
    const catalogItem = hasIdentifier
      ? getPosCatalogItem(rawItem.catalogId ?? rawItem.id)
      : BY_NAME.get(normalizeName(rawItem.name));

    if (!catalogItem) {
      throw new PosOrderValidationError("Uno de los productos no existe en el catálogo del POS");
    }

    const qty = Number(rawItem.qty ?? 1);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new PosOrderValidationError(`Cantidad inválida para ${catalogItem.name}`);
    }

    const previous = resolved.get(catalogItem.catalogId);
    const combinedQty = (previous?.qty || 0) + qty;
    if (combinedQty > 99) {
      throw new PosOrderValidationError(`Cantidad inválida para ${catalogItem.name}`);
    }

    resolved.set(catalogItem.catalogId, {
      catalogId: catalogItem.catalogId,
      name: catalogItem.name,
      price: catalogItem.price,
      qty: combinedQty,
      category: catalogItem.category,
      rewardDrink: Boolean(catalogItem.rewardDrink),
    });
  }

  return [...resolved.values()];
};

const BOWL_RULES = Object.freeze({
  base: {
    allowed: new Set(["white_rice", "brown_rice", "quinoa", "spring_mix"]),
    min: 1,
    max: 1,
  },
  proteins: {
    allowed: new Set(["tuna", "salmon", "shrimp", "octopus", "seared_tuna"]),
    min: 2,
    max: 3,
  },
  marinades: {
    allowed: new Set([
      "citrus_marinade", "shoyu_marinade", "ponzu_marinade", "spicy_marinade",
      "sesame_marinade", "wasabi_marinade", "miso_marinade", "garlic_ginger_marinade",
    ]),
    max: 2,
  },
  complements: {
    allowed: new Set([
      "shredded_carrots", "cucumber", "mango", "jicama", "seaweed", "avocado",
      "edamame", "kale", "peas", "corn", "pineapple", "chia_seeds",
    ]),
    max: 6,
  },
  sauces: {
    allowed: new Set([
      "spicy_mayo", "soy_sauce", "ponzu_sauce", "sesame_ginger", "wasabi_vinaigrette",
      "sweet_chili", "garlic_sriracha", "avocado_lime", "miso_dressing", "yuzu_kosho",
    ]),
    max: 2,
  },
  toppings: {
    allowed: new Set([
      "sesame_seeds", "crispy_onions", "nori_strips", "red_pepper_flakes",
      "pickled_radish", "toasted_coconut", "pumpkin_seeds", "furikake",
    ]),
    max: 5,
  },
});

export const POS_TOPPING_LABELS = Object.freeze({
  sesame_seeds: "Ajonjolí",
  crispy_onions: "Cebolla Crujiente",
  nori_strips: "Tiras de Alga Nori",
  red_pepper_flakes: "Pimienta Roja en Hojuelas",
  pickled_radish: "Rábano Encurtido",
  toasted_coconut: "Copos de Coco Tostado",
  pumpkin_seeds: "Pepitas",
  furikake: "Furikake",
});

export const sanitizePosRewardTopping = (value) => {
  if (typeof value !== "string" || !BOWL_RULES.toppings.allowed.has(value)) {
    throw new PosOrderValidationError("Selecciona un topping válido para aplicar el premio");
  }
  return value;
};

const sanitizeChoiceList = (name, value) => {
  const rule = BOWL_RULES[name];
  const list = value === undefined ? [] : value;
  if (!Array.isArray(list)) throw new PosOrderValidationError(`${name} debe ser una lista`);
  if (list.length > rule.max || (rule.min && list.length < rule.min)) {
    throw new PosOrderValidationError(`Cantidad de ${name} no permitida`);
  }
  if (new Set(list).size !== list.length || list.some((id) => typeof id !== "string" || !rule.allowed.has(id))) {
    throw new PosOrderValidationError(`La selección de ${name} no es válida`);
  }
  return [...list];
};

export const sanitizePosBowl = ({ base, proteins, marinades, complements, sauces, toppings }) => {
  if (typeof base !== "string" || !BOWL_RULES.base.allowed.has(base)) {
    throw new PosOrderValidationError("Selecciona una base válida para el bowl");
  }

  const safeProteins = sanitizeChoiceList("proteins", proteins);
  return {
    base,
    proteins: safeProteins,
    // Size is derived from the validated protein count. A browser-provided
    // bowlSize can never lower the amount charged for three proteins.
    bowlSize: safeProteins.length === 3 ? "large" : "normal",
    marinades: sanitizeChoiceList("marinades", marinades),
    complements: sanitizeChoiceList("complements", complements),
    sauces: sanitizeChoiceList("sauces", sauces),
    toppings: sanitizeChoiceList("toppings", toppings),
  };
};

const inventoryKeyFromName = (value) => normalizeName(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

const catalogItemForStoredLine = (item) => {
  if (!item || typeof item !== "object") return null;
  return getPosCatalogItem(item.catalogId ?? item.id)
    || BY_NAME.get(normalizeName(item.name));
};

const addDemand = (demand, key, amount = 1) => {
  const cleanKey = typeof key === "string" ? key.trim() : "";
  const cleanAmount = Number(amount);
  if (!cleanKey || !Number.isFinite(cleanAmount) || cleanAmount <= 0) return;
  demand.set(cleanKey, (demand.get(cleanKey) || 0) + cleanAmount);
};

// Converts a complete order into ingredient portions. Flat POS products use
// their canonical recipe and multiply every ingredient by item.qty; a custom
// bowl contributes each selected ingredient once. The resulting object is
// deterministic, which also makes retries safe to reconcile.
export const getPosInventoryDemand = (order = {}) => {
  const demand = new Map();

  if (order.base) addDemand(demand, order.base);
  for (const field of ["proteins", "marinades", "complements", "sauces", "toppings"]) {
    for (const key of Array.isArray(order[field]) ? order[field] : []) addDemand(demand, key);
  }
  if (order.rewardExtraTopping) addDemand(demand, order.rewardExtraTopping);

  for (const item of Array.isArray(order.items) ? order.items : []) {
    const qty = Number(item?.qty ?? 1);
    if (!Number.isInteger(qty) || qty <= 0) continue;
    const catalogItem = catalogItemForStoredLine(item);
    const recipe = catalogItem?.inventoryRecipe;
    if (recipe && typeof recipe === "object") {
      for (const [key, portions] of Object.entries(recipe)) {
        addDemand(demand, key, portions * qty);
      }
    } else {
      // Preserve stock matching for historical POS orders created before the
      // canonical catalog carried recipes.
      addDemand(demand, inventoryKeyFromName(item?.name), qty);
    }
  }

  return Object.fromEntries([...demand.entries()].sort(([a], [b]) => a.localeCompare(b)));
};

// StoreSettings.unavailableItems is the operational source of truth. A stale
// POS is rejected when it submits either a disabled catalog product or a
// product/custom bowl whose recipe contains a disabled ingredient.
export const getUnavailablePosSelections = ({
  items = [], bowl = null, rewardTopping = null, unavailableItems = [],
} = {}) => {
  const unavailable = new Set(
    (Array.isArray(unavailableItems) ? unavailableItems : [])
      .map((value) => String(value).trim())
      .filter(Boolean)
  );
  if (unavailable.size === 0) return [];

  const selected = new Set();
  const consider = (key) => {
    const cleanKey = key === undefined || key === null ? "" : String(key).trim();
    if (cleanKey && unavailable.has(cleanKey)) selected.add(cleanKey);
  };

  if (bowl) {
    consider(bowl.base);
    for (const field of ["proteins", "marinades", "complements", "sauces", "toppings"]) {
      for (const key of Array.isArray(bowl[field]) ? bowl[field] : []) consider(key);
    }
  }
  consider(rewardTopping);

  for (const item of Array.isArray(items) ? items : []) {
    const catalogItem = catalogItemForStoredLine(item);
    if (!catalogItem) continue;
    consider(catalogItem.catalogId);
    consider(catalogItem.legacyId);
    consider(inventoryKeyFromName(catalogItem.name));
    for (const key of Object.keys(catalogItem.inventoryRecipe || {})) consider(key);
  }

  return [...selected].sort();
};
