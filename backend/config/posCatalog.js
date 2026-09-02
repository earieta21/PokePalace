import { isPromo2x1Day } from "../utils/promoSchedule.js";
import { EXTRA_SCOOP_PRICE, PREMIUM_PROTEIN_PRICES } from "../pricing.js";

// Protein stock is stored in kilograms. A medium bowl contains 100 g total,
// a large bowl contains 120 g total, and every extra scoop adds 40 g.
export const MEDIUM_BOWL_PROTEIN_KG = 0.1;
export const LARGE_BOWL_PROTEIN_KG = 0.12;
export const EXTRA_SCOOP_PROTEIN_KG = 0.04;

// Source of truth for products sold through the POS. The browser may display
// these prices, but only this server-side catalog is used to charge an order.
export const POS_CATALOG = Object.freeze([
  {
    catalogId: "combo-palace", legacyId: 25, name: "Combo Palace", price: 289, category: "combos",
    // La receta depende de las tres elecciones guardadas en la línea. Se
    // expande en addItemDemand para descontar exactamente esos productos.
    inventoryRecipe: {}, comboPalace: true,
  },
  // Los bowls de la casa — mismos nombres y recetas que los presets del
  // inicio del sitio (src/pages/Home.jsx menuItems), todos a precio de
  // bowl normal.
  {
    catalogId: "bowl-the-og", legacyId: 1, name: "The OG", price: 230, category: "bowls",
    inventoryRecipe: {
      white_rice: 1, tuna: 0.05, salmon: 0.05, citrus_marinade: 1,
      shredded_carrots: 1, surimi: 1, seaweed: 1, edamame: 1, pineapple: 1, cucumber: 1,
      spicy_mayo: 1, crispy_onions: 1, sesame_seeds: 1, nori_strips: 1,
    },
  },
  {
    catalogId: "bowl-skinny", legacyId: 2, name: "Skinny Bowl", price: 230, category: "bowls",
    inventoryRecipe: {
      white_rice: 0.5, spring_mix: 0.5, shrimp: 0.05, tuna: 0.05, sweet_marinade: 1,
      cucumber: 1, shredded_carrots: 1, mango: 1, red_onion: 1, avocado: 1,
      cilantro_dressing: 1, sesame_seeds: 1, nori_strips: 1, croutons: 1,
    },
  },
  {
    catalogId: "bowl-quinoa", legacyId: 3, name: "Quinoa Bowl", price: 230, category: "bowls",
    inventoryRecipe: {
      quinoa: 1, tuna: 0.05, shrimp: 0.05, citrus_marinade: 1,
      seaweed: 1, shredded_carrots: 1, spicy_surimi: 1, edamame: 1, red_onion: 1,
      cilantro_dressing: 1, crispy_onions: 1, nori_strips: 1, sesame_seeds: 1,
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
  // Promo 2x1 recurrente, solo martes y jueves (solo en local) — 2 bowls
  // medianos por el precio de un bowl grande. Misma proteína para los 2,
  // 60 g + 60 g = 120 g total (ver el condicional de proteinKg en
  // addItemDemand más abajo). Complementos limitados a 4 por bowl, pero eso
  // no se rastrea aquí — no se captura la receta, igual que
  // bowl-mediano-rapido/bowl-grande-rapido. El día se valida en
  // resolvePosItems (isPromo2x1Day) — fuera de martes/jueves esta línea se
  // rechaza aunque llegue en el body.
  {
    catalogId: "promo-2x1-dinein", legacyId: 26, name: "Promo 2x1 (solo en local)", price: 250, category: "bowls",
    inventoryRecipe: {},
  },
  {
    // Mantiene catalogId/legacyId de "Agua Mineral" para que las órdenes
    // históricas y colas offline sigan resolviendo al mismo producto.
    catalogId: "mineral-water", legacyId: 11, name: "Topochico", price: 35, category: "drinks",
    inventoryRecipe: { topochico: 1 },
  },
  {
    catalogId: "coca-zero", legacyId: 13, name: "Coca-Zero", price: 35, category: "drinks",
    inventoryRecipe: { coca_zero: 1 },
  },
  {
    catalogId: "coca-cola-regular", legacyId: 24, name: "Coca-Cola", price: 35, category: "drinks",
    inventoryRecipe: { coca_cola: 1 },
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
  {
    catalogId: "cacao-rice-cake", legacyId: 16, name: "Cacao Rice Cake", price: 30, category: "extras",
    inventoryRecipe: {},
  },
  {
    catalogId: "choco-rice-cake", legacyId: 17, name: "Choco Rice Cake", price: 35, category: "extras", rewardSnack: true,
    inventoryRecipe: {},
  },
  {
    catalogId: "miel-rice-cake", legacyId: 23, name: "Miel Rice Cake", price: 35, category: "extras",
    inventoryRecipe: {},
  },
  {
    // Cobro rápido de una porción extra (40 g) de cualquier proteína ya en
    // el bowl, sin pasar por el armador completo. No trae inventoryRecipe a
    // propósito -- la proteína la captura el cajero en el picker (ver
    // resolvePosItems más abajo), igual que bowl-mediano-rapido/
    // bowl-grande-rapido. El precio base es EXTRA_SCOOP_PRICE; si la
    // proteína elegida trae upcharge en PREMIUM_PROTEIN_PRICES (hoy solo
    // atún sellado, +$20), resolvePosItems lo suma.
    catalogId: "extra-protein-scoop", legacyId: 27, name: "Extra de proteína", price: EXTRA_SCOOP_PRICE, category: "extras",
    inventoryRecipe: {},
  },
]);

const normalizeName = (value) => String(value || "").normalize("NFKC").trim().toLocaleLowerCase("es-MX");

const BY_CATALOG_ID = new Map(POS_CATALOG.map((item) => [item.catalogId, item]));
const BY_LEGACY_ID = new Map(POS_CATALOG.map((item) => [String(item.legacyId), item]));
const BY_NAME = new Map(POS_CATALOG.map((item) => [normalizeName(item.name), item]));

export const COMBO_PALACE_BOWL_IDS = new Set([
  "bowl-the-og", "bowl-skinny", "bowl-quinoa",
]);
export const COMBO_PALACE_DRINK_IDS = new Set([
  "mineral-water", "coca-zero", "coca-cola-regular", "agua-del-dia",
]);
export const COMBO_PALACE_RICE_CAKE_IDS = new Set([
  "cacao-rice-cake", "choco-rice-cake", "miel-rice-cake",
]);

const sanitizeComboPalaceSelections = (rawItem, itemName = "Combo Palace") => {
  const comboBowlId = typeof rawItem.comboBowlId === "string" ? rawItem.comboBowlId.trim() : "";
  const comboDrinkId = typeof rawItem.comboDrinkId === "string" ? rawItem.comboDrinkId.trim() : "";
  const comboRiceCakeId = typeof rawItem.comboRiceCakeId === "string" ? rawItem.comboRiceCakeId.trim() : "";
  if (
    !COMBO_PALACE_BOWL_IDS.has(comboBowlId)
    || !COMBO_PALACE_DRINK_IDS.has(comboDrinkId)
    || !COMBO_PALACE_RICE_CAKE_IDS.has(comboRiceCakeId)
  ) {
    throw new PosOrderValidationError(`Selecciona un bowl, una bebida y un Rice Cake válidos para ${itemName}`);
  }
  return { comboBowlId, comboDrinkId, comboRiceCakeId };
};

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

    if (catalogItem.catalogId === "promo-2x1-dinein" && !isPromo2x1Day()) {
      throw new PosOrderValidationError("La Promo 2x1 solo está disponible los martes y jueves");
    }

    const qty = Number(rawItem.qty ?? 1);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new PosOrderValidationError(`Cantidad inválida para ${catalogItem.name}`);
    }

    // Bowls de venta rápida (mediano/grande) no traen receta fija -- si en
    // caja se capturó la proteína, se guarda para poder descontar al menos
    // esa parte del inventario (ver addItemDemand más abajo). Se acepta en
    // cualquier producto, no solo esos dos, pero solo se usa cuando el
    // catálogo no tiene inventoryRecipe.
    let protein;
    if (rawItem.protein !== undefined && rawItem.protein !== null && rawItem.protein !== "") {
      if (typeof rawItem.protein !== "string" || !BOWL_RULES.proteins.allowed.has(rawItem.protein)) {
        throw new PosOrderValidationError(`Proteína inválida para ${catalogItem.name}`);
      }
      protein = rawItem.protein;
    }

    if (catalogItem.catalogId === "extra-protein-scoop" && !protein) {
      throw new PosOrderValidationError("Selecciona la proteína del extra");
    }

    const comboSelections = catalogItem.comboPalace
      ? sanitizeComboPalaceSelections(rawItem, catalogItem.name)
      : null;

    // Dos líneas del mismo producto con distinta proteína o distintas
    // elecciones del combo no se combinan.
    // se mantienen separadas para no perder de cuál proteína era cada una.
    const mapKey = comboSelections
      ? `${catalogItem.catalogId}::${comboSelections.comboBowlId}::${comboSelections.comboDrinkId}::${comboSelections.comboRiceCakeId}`
      : protein ? `${catalogItem.catalogId}::${protein}` : catalogItem.catalogId;
    const previous = resolved.get(mapKey);
    const combinedQty = (previous?.qty || 0) + qty;
    if (combinedQty > 99) {
      throw new PosOrderValidationError(`Cantidad inválida para ${catalogItem.name}`);
    }

    // El extra de proteína cobra el upcharge de la proteína elegida (hoy
    // solo atún sellado) encima del precio base de un scoop extra.
    const price = catalogItem.catalogId === "extra-protein-scoop"
      ? EXTRA_SCOOP_PRICE + (PREMIUM_PROTEIN_PRICES[protein] || 0)
      : catalogItem.price;

    resolved.set(mapKey, {
      catalogId: catalogItem.catalogId,
      name: catalogItem.name,
      price,
      qty: combinedQty,
      category: catalogItem.category,
      rewardDrink: Boolean(catalogItem.rewardDrink),
      rewardSnack: Boolean(catalogItem.rewardSnack),
      ...(protein ? { protein } : {}),
      ...(comboSelections || {}),
    });
  }

  return [...resolved.values()];
};

const COMPLEMENTS_CATALOG = new Set([
  "shredded_carrots", "cucumber", "mango", "jicama", "seaweed", "avocado",
  "edamame", "red_onion", "beet", "surimi", "spicy_surimi",
  "kale", "peas", "corn", "pineapple", "chia_seeds",
]);

const BOWL_RULES = Object.freeze({
  base: {
    allowed: new Set(["white_rice", "brown_rice", "quinoa", "spring_mix"]),
    min: 1,
    max: 1,
  },
  proteins: {
    allowed: new Set(["tuna", "salmon", "shrimp", "tofu", "octopus", "seared_tuna"]),
    min: 1,
    max: 3,
  },
  marinades: {
    allowed: new Set([
      "citrus_marinade", "shoyu_marinade", "ponzu_marinade", "spicy_marinade",
      "sesame_marinade", "wasabi_marinade", "miso_marinade", "garlic_ginger_marinade",
    ]),
    max: 2,
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
      "spicy_mayo", "soy_sauce", "ponzu_sauce", "sesame_ginger", "wasabi_vinaigrette",
      "sweet_dressing", "citrus_dressing", "red_sauce", "sriracha", "cilantro_dressing",
      "sweet_chili", "garlic_sriracha", "avocado_lime", "miso_dressing", "yuzu_kosho",
    ]),
    max: 2,
  },
  toppings: {
    allowed: new Set([
      "sesame_seeds", "crispy_onions", "nori_strips", "red_pepper_flakes",
      "black_olives", "toasted_peanuts", "masago", "croutons",
      "pickled_radish", "toasted_coconut", "pumpkin_seeds", "furikake",
    ]),
    max: 5,
  },
});

export const POS_TOPPING_LABELS = Object.freeze({
  black_olives: "Aceitunas Negras",
  toasted_peanuts: "Cacahuate Tostado",
  sesame_seeds: "Ajonjolí",
  masago: "Masago",
  croutons: "Crotones",
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

// Canal de publicidad que el cliente dice haber usado para conocer el
// restaurante. Los ids deben coincidir con src/data/referralSources.js.
export const REFERRAL_SOURCES = new Set([
  "instagram", "facebook", "tiktok", "google", "recomendacion", "ubicacion", "otro",
]);

export const sanitizePosReferralSource = (referralSource, referralSourceOther) => {
  if (referralSource === undefined || referralSource === null || referralSource === "") {
    return { referralSource: null, referralSourceOther: null };
  }
  if (typeof referralSource !== "string" || !REFERRAL_SOURCES.has(referralSource)) {
    throw new PosOrderValidationError("Selecciona un método de publicidad válido");
  }
  const cleanOther = referralSource === "otro" && typeof referralSourceOther === "string" && referralSourceOther.trim()
    ? referralSourceOther.trim().slice(0, 80)
    : null;
  return { referralSource, referralSourceOther: cleanOther };
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

export const sanitizePosBowl = ({ base, proteins, marinades, complements, sauces, toppings, extraScoopProteins }) => {
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
  demand.set(cleanKey, Number(((demand.get(cleanKey) || 0) + cleanAmount).toFixed(6)));
};

// Suma la demanda de ingredientes de un bowl (ya sea los campos planos de
// nivel superior de una orden, o una línea kind:"bowl" del carrito) — "mitad
// y mitad" reparte la porción normal de base entre las 2 elegidas (0.5 c/u)
// en vez de sumar una porción completa de cada una.
const addBowlDemand = (demand, bowlLike) => {
  if (Array.isArray(bowlLike.bases) && bowlLike.bases.length > 0) {
    const portion = 1 / bowlLike.bases.length;
    for (const key of bowlLike.bases) addDemand(demand, key, portion);
  } else if (bowlLike.base) {
    addDemand(demand, bowlLike.base);
  }
  const proteins = Array.isArray(bowlLike.proteins) ? bowlLike.proteins : [];
  const totalProteinKg = proteins.length === 3 ? LARGE_BOWL_PROTEIN_KG : MEDIUM_BOWL_PROTEIN_KG;
  const proteinPortionKg = proteins.length > 0 ? totalProteinKg / proteins.length : 0;
  for (const key of proteins) addDemand(demand, key, proteinPortionKg);

  for (const field of ["marinades", "complements", "sauces", "toppings"]) {
    for (const key of Array.isArray(bowlLike[field]) ? bowlLike[field] : []) addDemand(demand, key);
  }
  for (const key of Array.isArray(bowlLike.extraScoopProteins) ? bowlLike.extraScoopProteins : []) {
    addDemand(demand, key, EXTRA_SCOOP_PROTEIN_KG);
  }
};

const addItemDemand = (demand, item) => {
  const qty = Number(item?.qty ?? 1);
  if (!Number.isInteger(qty) || qty <= 0) return;
  const catalogItem = catalogItemForStoredLine(item);
  if (catalogItem?.comboPalace) {
    const selections = [item.comboBowlId, item.comboDrinkId, item.comboRiceCakeId];
    for (const catalogId of selections) {
      if (typeof catalogId === "string" && catalogId !== catalogItem.catalogId) {
        addItemDemand(demand, { catalogId, qty });
      }
    }
    return;
  }
  const recipe = catalogItem?.inventoryRecipe;
  if (recipe && typeof recipe === "object") {
    const entries = Object.entries(recipe);
    if (entries.length > 0) {
      for (const [key, portions] of entries) addDemand(demand, key, portions * qty);
    } else if (typeof item?.protein === "string" && item.protein) {
      // Venta rápida sin receta (bowl mediano/grande/promo 2x1): se descuenta
      // la proteína capturada en caja, aunque el resto del bowl (base,
      // complementos, salsas) no se pueda rastrear. Sin proteína capturada
      // no se descuenta nada -- comportamiento original: no se sabe qué
      // llevó el bowl. La promo 2x1 usa 60 g + 60 g = 120 g, la misma suma
      // que un bowl grande, aunque el motivo sea otro (2 bowls chicos, no 1
      // bowl con más proteína). El extra de proteína es solo el scoop (40 g).
      const proteinKg = catalogItem.catalogId === "extra-protein-scoop"
        ? EXTRA_SCOOP_PROTEIN_KG
        : catalogItem.catalogId === "bowl-grande-rapido" || catalogItem.catalogId === "promo-2x1-dinein"
          ? LARGE_BOWL_PROTEIN_KG
          : MEDIUM_BOWL_PROTEIN_KG;
      addDemand(demand, item.protein, proteinKg * qty);
    }
  } else {
    // Preserve stock matching for historical POS orders created before the
    // canonical catalog carried recipes (producto sin inventoryRecipe en
    // absoluto, no solo vacío).
    addDemand(demand, inventoryKeyFromName(item?.name), qty);
  }
};

// Converts a complete order into ingredient portions. Flat POS products use
// their canonical recipe and multiply every ingredient by item.qty; a custom
// bowl contributes each selected ingredient once. A cliente/kiosco cart
// (order.cartItems) contributes the same way, once per line. The resulting
// object is deterministic, which also makes retries safe to reconcile.
export const getPosInventoryDemand = (order = {}) => {
  const demand = new Map();

  addBowlDemand(demand, order);
  if (order.rewardExtraTopping) addDemand(demand, order.rewardExtraTopping);

  for (const item of Array.isArray(order.items) ? order.items : []) {
    addItemDemand(demand, item);
  }

  for (const line of Array.isArray(order.cartItems) ? order.cartItems : []) {
    if (line?.kind === "item") addItemDemand(demand, line);
    else addBowlDemand(demand, line || {});
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
    consider(item.protein);
    if (catalogItem.comboPalace) {
      for (const catalogId of [item.comboBowlId, item.comboDrinkId, item.comboRiceCakeId]) {
        const selectedItem = getPosCatalogItem(catalogId);
        if (!selectedItem) continue;
        consider(selectedItem.catalogId);
        consider(selectedItem.legacyId);
        consider(inventoryKeyFromName(selectedItem.name));
        for (const key of Object.keys(selectedItem.inventoryRecipe || {})) consider(key);
      }
    }
  }

  return [...selected].sort();
};
