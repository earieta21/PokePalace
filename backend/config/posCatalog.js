// Protein stock is stored in kilograms. A medium bowl contains 100 g total,
// a large bowl contains 120 g total, and every extra scoop adds 40 g.
export const MEDIUM_BOWL_PROTEIN_KG = 0.1;
export const LARGE_BOWL_PROTEIN_KG = 0.12;
export const EXTRA_SCOOP_PROTEIN_KG = 0.04;

// Source of truth for products sold through the POS. The browser may display
// these prices, but only this server-side catalog is used to charge an order.
export const POS_CATALOG = Object.freeze([
  // Los 4 bowls de la casa — mismas combinaciones que los presets del inicio
  // del sitio (src/order/OrderPage.jsx PRESETS), todos a precio de bowl normal.
  {
    catalogId: "bowl-emerald-salmon", legacyId: 1, name: "Bowl de salmón esmeralda", price: 230, category: "bowls",
    inventoryRecipe: {
      white_rice: 1, salmon: 0.05, tuna: 0.05,
      avocado: 1, cucumber: 1, edamame: 1,
      spicy_mayo: 1, citrus_dressing: 1,
      sesame_seeds: 1, nori_strips: 1,
    },
  },
  {
    catalogId: "bowl-spicy-tuna", legacyId: 2, name: "Bowl picante de atún crujiente", price: 230, category: "bowls",
    inventoryRecipe: {
      quinoa: 1, tuna: 0.05, salmon: 0.05,
      cucumber: 1, edamame: 1, spicy_surimi: 1,
      sriracha: 1, spicy_mayo: 1,
      masago: 1, nori_strips: 1,
    },
  },
  {
    catalogId: "bowl-tropical-shrimp", legacyId: 3, name: "Bowl tropical de camarón", price: 230, category: "bowls",
    inventoryRecipe: {
      spring_mix: 1, shrimp: 0.05, tofu: 0.05,
      pineapple: 1, avocado: 1, cucumber: 1,
      sweet_dressing: 1, cilantro_dressing: 1,
      sesame_seeds: 1, masago: 1,
    },
  },
  {
    catalogId: "bowl-citrus-tofu", legacyId: 4, name: "Tofu Cítrico", price: 230, category: "bowls",
    inventoryRecipe: {
      spring_mix: 1, tofu: 0.05, shrimp: 0.05,
      cucumber: 1, beet: 1, avocado: 1,
      citrus_dressing: 1, cilantro_dressing: 1,
      sesame_seeds: 1, nori_strips: 1,
    },
  },
  // Venta rápida sin ingredientes específicos — para cobrar de una vez
  // cuando no da tiempo de capturar el bowl personalizado completo (ej.
  // fila larga). No trae inventoryRecipe a propósito: no se sabe qué
  // llevó el bowl, así que no se descuenta inventario por esta venta.
  {
    catalogId: "bowl-mediano-rapido", legacyId: 20, name: "Bowl mediano", price: 230, category: "bowls",
    inventoryRecipe: {},
  },
  {
    catalogId: "bowl-grande-rapido", legacyId: 21, name: "Bowl grande", price: 250, category: "bowls",
    inventoryRecipe: {},
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
    // Conserva el catalogId anterior para que ventas pendientes del POS sigan resolviendo.
    catalogId: "agua-del-dia", legacyId: 15, name: "Agua del día", price: 35, category: "drinks", rewardDrink: true,
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

const COMPLEMENTS_CATALOG = new Set([
  "shredded_carrots", "seaweed", "edamame", "red_onion", "cucumber",
  "pineapple", "beet", "surimi", "spicy_surimi", "avocado",
]);

const BOWL_RULES = Object.freeze({
  base: {
    allowed: new Set(["white_rice", "spring_mix", "quinoa"]),
    min: 1,
    max: 2,
  },
  proteins: {
    allowed: new Set(["tuna", "salmon", "shrimp", "tofu"]),
    // Minimo 1: hay clientes que piden bowls con una sola proteina. El
    // precio es el mismo ($230) que con 2 — ver BOWL_BASE_PRICE.
    min: 1,
    max: 3,
  },
  marinades: {
    allowed: new Set(),
    max: 0,
  },
  // Sin tope artificial: los primeros COMPLEMENT_FREE_LIMIT van gratis y cada
  // uno extra cuesta EXTRA_COMPLEMENT_PRICE (ver pricing.js) — el único
  // límite real es el tamaño del catálogo mismo.
  complements: {
    allowed: COMPLEMENTS_CATALOG,
    max: COMPLEMENTS_CATALOG.size,
  },
  sauces: {
    allowed: new Set([
      "spicy_mayo", "sweet_dressing", "citrus_dressing",
      "red_sauce", "sriracha", "cilantro_dressing",
    ]),
    max: 2,
  },
  toppings: {
    allowed: new Set([
      "black_olives", "toasted_peanuts", "sesame_seeds",
      "nori_strips", "masago", "croutons",
    ]),
    max: 5,
  },
});

export const POS_TOPPING_LABELS = Object.freeze({
  black_olives: "Aceitunas Negras",
  toasted_peanuts: "Cacahuate Tostado",
  sesame_seeds: "Ajonjolí",
  nori_strips: "Tiras de Alga Nori",
  masago: "Masago",
  croutons: "Crotones",
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

// Un "scoop extra" es una porción adicional (40 g, $40) de una proteína ya
// elegida — admite repetidos (dos scoops extra de salmón es válido) pero
// cada entrada debe corresponder a una proteína ya presente en `proteins`.
const EXTRA_SCOOP_MAX = 3;
const sanitizeExtraScoops = (value, chosenProteins) => {
  const list = value === undefined ? [] : value;
  if (!Array.isArray(list) || list.length > EXTRA_SCOOP_MAX) {
    throw new PosOrderValidationError("Cantidad de scoops extra no permitida");
  }
  if (list.some((id) => typeof id !== "string" || !chosenProteins.includes(id))) {
    throw new PosOrderValidationError("El scoop extra debe ser de una proteína ya elegida");
  }
  return [...list];
};

export const sanitizePosBowl = ({ base, bases, proteins, marinades, complements, sauces, toppings, extraScoopProteins }) => {
  // Legacy POS clients send only `base`; newer clients send `bases` and keep
  // `base` equal to the first selection for compatibility with old readers.
  const safeBases = sanitizeChoiceList("base", bases === undefined ? [base] : bases);
  if (base !== undefined && base !== safeBases[0]) {
    throw new PosOrderValidationError("La base principal no coincide con la selección de bases");
  }

  const safeProteins = sanitizeChoiceList("proteins", proteins);
  return {
    base: safeBases[0],
    bases: safeBases,
    proteins: safeProteins,
    // Size is derived from the validated protein count. A browser-provided
    // bowlSize can never lower the amount charged for three proteins.
    bowlSize: safeProteins.length === 3 ? "large" : "normal",
    marinades: sanitizeChoiceList("marinades", marinades),
    complements: sanitizeChoiceList("complements", complements),
    sauces: sanitizeChoiceList("sauces", sauces),
    toppings: sanitizeChoiceList("toppings", toppings),
    extraScoopProteins: sanitizeExtraScoops(extraScoopProteins, safeProteins),
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
  // Keep decimal kilograms stable across repeated additions (for example,
  // 0.05 kg from a preset plus two 0.04 kg extra scoops).
  const nextAmount = (demand.get(cleanKey) || 0) + cleanAmount;
  demand.set(cleanKey, Number(nextAmount.toFixed(6)));
};

// Converts a complete order into inventory quantities. Flat POS products use
// their canonical recipe and multiply every ingredient by item.qty. A custom
// bowl distributes its total protein weight equally among the selected
// proteins; extra scoops add 40 g each. The resulting object is deterministic,
// which also makes retries safe to reconcile.
export const getPosInventoryDemand = (order = {}) => {
  const demand = new Map();

  // "Mitad y mitad" reparte la porción normal de base entre las 2 elegidas
  // (0.5 c/u) en vez de sumar una porción completa de cada una.
  if (Array.isArray(order.bases) && order.bases.length > 0) {
    const portion = 1 / order.bases.length;
    for (const key of order.bases) addDemand(demand, key, portion);
  } else if (order.base) {
    addDemand(demand, order.base);
  }
  const selectedProteins = Array.isArray(order.proteins) ? order.proteins : [];
  if (selectedProteins.length > 0) {
    const totalProteinKg = order.bowlSize === "large" || selectedProteins.length === 3
      ? LARGE_BOWL_PROTEIN_KG
      : MEDIUM_BOWL_PROTEIN_KG;
    const kgPerProtein = totalProteinKg / selectedProteins.length;
    for (const key of selectedProteins) addDemand(demand, key, kgPerProtein);
  }

  for (const field of ["marinades", "complements", "sauces", "toppings"]) {
    for (const key of Array.isArray(order[field]) ? order[field] : []) addDemand(demand, key);
  }
  for (const key of Array.isArray(order.extraScoopProteins) ? order.extraScoopProteins : []) {
    addDemand(demand, key, EXTRA_SCOOP_PROTEIN_KG);
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
    const selectedBases = Array.isArray(bowl.bases) && bowl.bases.length > 0
      ? bowl.bases
      : [bowl.base];
    for (const key of selectedBases) consider(key);
    for (const field of ["proteins", "marinades", "complements", "sauces", "toppings", "extraScoopProteins"]) {
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
