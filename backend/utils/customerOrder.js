import { zonedParts, zonedWeekday } from "./timeZone.js";
import {
  computeBowlSubtotal,
  computeExtrasSubtotal,
  PROMO_2X1_BOWLS_PRICE,
  PROMO_2X1_MAX_COMPLEMENTS,
} from "../pricing.js";
import { getUnavailablePosSelections, resolvePosItems } from "../config/posCatalog.js";

export const CUSTOMER_ORDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;

const BOWL_CATALOG = Object.freeze({
  base: new Set(["white_rice", "brown_rice", "quinoa", "spring_mix"]),
  proteins: new Set(["tuna", "salmon", "shrimp", "tofu", "octopus", "seared_tuna"]),
  marinades: new Set(["citrus_marinade", "spicy_marinade", "sweet_marinade"]),
  complements: new Set([
    "shredded_carrots", "cucumber", "mango", "jicama", "seaweed", "avocado",
    "edamame", "red_onion", "beet", "surimi", "spicy_surimi",
    "kale", "peas", "corn", "pineapple", "chia_seeds",
  ]),
  sauces: new Set([
    "spicy_mayo", "soy_sauce", "ponzu_sauce", "sesame_ginger", "wasabi_vinaigrette",
    "sweet_dressing", "citrus_dressing", "red_sauce", "sriracha", "cilantro_dressing",
    "sweet_chili", "garlic_sriracha", "avocado_lime", "miso_dressing", "yuzu_kosho",
  ]),
  toppings: new Set([
    "sesame_seeds", "crispy_onions", "nori_strips", "red_pepper_flakes",
    "black_olives", "toasted_peanuts", "masago", "croutons",
    "pickled_radish", "toasted_coconut", "pumpkin_seeds", "furikake",
  ]),
});

const normalizeCatalogList = (value, field, max) => {
  const items = value === undefined || value === null ? [] : value;
  if (!Array.isArray(items) || items.length > max || new Set(items).size !== items.length) {
    throw new TypeError(`Selección inválida en ${field}`);
  }
  if (items.some((item) => typeof item !== "string" || !BOWL_CATALOG[field].has(item))) {
    throw new TypeError(`Selección inválida en ${field}`);
  }
  return [...items];
};

// Un "scoop extra" es una porción adicional (40 g) de una proteína que el
// cliente ya eligió — a diferencia de las demás listas, sí admite repetidos
// (dos scoops extra de salmón es válido) pero cada entrada debe corresponder
// a una proteína ya presente en `proteins`.
const EXTRA_SCOOP_MAX = 3;
const normalizeExtraScoops = (value, chosenProteins) => {
  const items = value === undefined || value === null ? [] : value;
  if (!Array.isArray(items) || items.length > EXTRA_SCOOP_MAX) {
    throw new TypeError("Selección inválida en extraScoopProteins");
  }
  if (items.some((item) => typeof item !== "string" || !chosenProteins.includes(item))) {
    throw new TypeError("El scoop extra debe ser de una proteína ya elegida");
  }
  return [...items];
};

export function sanitizeCustomerBowl({
  base,
  bases,
  protein,
  proteins,
  marinades,
  complements,
  sauces,
  toppings,
  extraScoopProteins,
}) {
  // "Mitad y mitad" manda 2 bases en `bases`; los pedidos normales (y los
  // clientes viejos que solo conocen `base`) siguen mandando 1 sola.
  const baseInput = Array.isArray(bases) && bases.length > 0
    ? bases
    : typeof base === "string" && base
      ? [base]
      : [];
  if (
    baseInput.length === 0 ||
    baseInput.length > 2 ||
    new Set(baseInput).size !== baseInput.length ||
    baseInput.some((id) => typeof id !== "string" || !BOWL_CATALOG.base.has(id))
  ) {
    throw new TypeError("Selecciona una base válida");
  }
  const safeBases = [...baseInput];
  const proteinInput = Array.isArray(proteins)
    ? proteins
    : typeof protein === "string" && protein
      ? [protein]
      : [];
  const safeProteins = normalizeCatalogList(proteinInput, "proteins", 3);
  if (safeProteins.length < 1) throw new TypeError("Selecciona al menos 1 proteína");

  return {
    base: safeBases[0],
    bases: safeBases,
    proteins: safeProteins,
    marinades: normalizeCatalogList(marinades, "marinades", 2),
    // El límite de complementos "gratis" (6) es una regla de precio, no de
    // catálogo — aquí solo se valida contra el tamaño real del catálogo, para
    // permitir complementos extra de pago sin un tope artificial.
    complements: normalizeCatalogList(complements, "complements", BOWL_CATALOG.complements.size),
    sauces: normalizeCatalogList(sauces, "sauces", 2),
    toppings: normalizeCatalogList(toppings, "toppings", 5),
    extraScoopProteins: normalizeExtraScoops(extraScoopProteins, safeProteins),
    bowlSize: safeProteins.length === 3 ? "large" : "normal",
  };
}

// Un bowl dentro de la promo "2x1 en Bowls" — como sanitizeCustomerBowl,
// pero sin proteína propia (la comparten los 2 bowls, se valida aparte en
// sanitizeCustomerPromo2x1) y con un tope de complementos más bajo que un
// bowl normal.
function sanitizePromo2x1Bowl({ base, bases, marinades, complements, sauces, toppings }, index) {
  const baseInput = Array.isArray(bases) && bases.length > 0
    ? bases
    : typeof base === "string" && base
      ? [base]
      : [];
  if (
    baseInput.length === 0 ||
    baseInput.length > 2 ||
    new Set(baseInput).size !== baseInput.length ||
    baseInput.some((id) => typeof id !== "string" || !BOWL_CATALOG.base.has(id))
  ) {
    throw new TypeError(`Bowl ${index + 1} de la promo: selecciona una base válida`);
  }
  const safeBases = [...baseInput];

  return {
    base: safeBases[0],
    bases: safeBases,
    marinades: normalizeCatalogList(marinades, "marinades", 2),
    complements: normalizeCatalogList(complements, "complements", PROMO_2X1_MAX_COMPLEMENTS),
    sauces: normalizeCatalogList(sauces, "sauces", 2),
    toppings: normalizeCatalogList(toppings, "toppings", 5),
  };
}

// Promo pública "2x1 en Bowls": 1 proteína compartida entre 2 bowls
// personalizados (60 g + 60 g = 120 g), cada uno con máx.
// PROMO_2X1_MAX_COMPLEMENTS complementos, precio plano
// PROMO_2X1_BOWLS_PRICE sin importar lo elegido.
export function sanitizeCustomerPromo2x1({ protein, bowls }) {
  if (typeof protein !== "string" || !BOWL_CATALOG.proteins.has(protein)) {
    throw new TypeError("2x1 en Bowls: selecciona 1 proteína válida");
  }
  if (!Array.isArray(bowls) || bowls.length !== 2) {
    throw new TypeError("2x1 en Bowls: se requieren 2 bowls");
  }
  const safeBowls = bowls.map((bowl, index) => sanitizePromo2x1Bowl(bowl || {}, index));
  return { protein, bowls: safeBowls };
}

/**
 * Returns the catalog ids selected by a customer that staff has marked as
 * unavailable. The browser and the staff availability screen both exchange
 * catalog ids (for example, `white_rice`), so matching intentionally remains
 * exact and case-sensitive here as well.
 */
export function findUnavailableCustomerBowlItems(bowl, unavailableItems) {
  if (!bowl || !Array.isArray(unavailableItems) || unavailableItems.length === 0) {
    return [];
  }

  const unavailable = new Set(
    unavailableItems.filter((item) => typeof item === "string")
  );
  const selectedIds = [
    ...(Array.isArray(bowl.bases) && bowl.bases.length > 0 ? bowl.bases : [bowl.base]),
    ...(Array.isArray(bowl.proteins) ? bowl.proteins : []),
    ...(Array.isArray(bowl.marinades) ? bowl.marinades : []),
    ...(Array.isArray(bowl.complements) ? bowl.complements : []),
    ...(Array.isArray(bowl.sauces) ? bowl.sauces : []),
    ...(Array.isArray(bowl.toppings) ? bowl.toppings : []),
    ...(Array.isArray(bowl.extraScoopProteins) ? bowl.extraScoopProteins : []),
  ];

  return [...new Set(selectedIds.filter((item) => unavailable.has(item)))];
}

// Como findUnavailableCustomerBowlItems, pero para una línea de la promo
// "2x1 en Bowls" — revisa la proteína compartida y los ingredientes de
// ambos bowls.
export function findUnavailablePromo2x1Items(promoLine, unavailableItems) {
  if (!promoLine || !Array.isArray(unavailableItems) || unavailableItems.length === 0) {
    return [];
  }

  const unavailable = new Set(
    unavailableItems.filter((item) => typeof item === "string")
  );
  const bowlIds = (Array.isArray(promoLine.bowls) ? promoLine.bowls : []).flatMap((bowl) => [
    ...(Array.isArray(bowl?.bases) && bowl.bases.length > 0 ? bowl.bases : [bowl?.base]),
    ...(Array.isArray(bowl?.marinades) ? bowl.marinades : []),
    ...(Array.isArray(bowl?.complements) ? bowl.complements : []),
    ...(Array.isArray(bowl?.sauces) ? bowl.sauces : []),
    ...(Array.isArray(bowl?.toppings) ? bowl.toppings : []),
  ]);
  const selectedIds = [promoLine.protein, ...bowlIds];

  return [...new Set(selectedIds.filter((item) => unavailable.has(item)))];
}

// Artículos del catálogo POS que existen solo para que el personal cobre
// rápido sin capturar el bowl completo (no traen receta de inventario) — no
// tienen sentido como elección deliberada de un cliente armando su pedido.
export const CUSTOMER_EXCLUDED_CATALOG_IDS = new Set([
  "bowl-mediano-rapido",
  "bowl-grande-rapido",
  "promo-2x1-dinein",
]);

const MAX_CART_LINES = 12;

const priceCustomerBowl = (bowl) => {
  const subtotal = computeBowlSubtotal(bowl.bowlSize) + computeExtrasSubtotal({
    extraScoops: bowl.extraScoopProteins.length,
    complementsCount: bowl.complements.length,
    proteins: bowl.proteins,
  });
  return Math.round(subtotal * 100) / 100;
};

// Valida un carrito completo de cliente/kiosco: 1 o más bowls personalizados
// y/o artículos del catálogo (bebidas, entradas, bowls de la casa). Cada
// línea de bowl se valida igual que un pedido de un solo bowl; las líneas de
// artículo reutilizan `resolvePosItems` (mismo precio/tope/deduplicación que
// ya usa el POS) para no duplicar esa lógica.
export function sanitizeCustomerCart(cart) {
  if (!Array.isArray(cart) || cart.length === 0) {
    throw new TypeError("Tu carrito está vacío");
  }
  if (cart.length > MAX_CART_LINES) {
    throw new TypeError(`Tu carrito admite máximo ${MAX_CART_LINES} artículos`);
  }

  const bowlLines = [];
  const rawItemLines = [];
  cart.forEach((line, index) => {
    if (line?.kind === "item") {
      const catalogId = String(line?.catalogId || "").trim();
      if (CUSTOMER_EXCLUDED_CATALOG_IDS.has(catalogId)) {
        throw new TypeError(`Artículo ${index + 1}: no disponible para pedidos en línea`);
      }
      rawItemLines.push({
        catalogId,
        qty: line?.qty,
        comboBowlId: line?.comboBowlId,
        comboDrinkId: line?.comboDrinkId,
        comboRiceCakeId: line?.comboRiceCakeId,
      });
    } else if (line?.kind === "promo2x1") {
      try {
        const promo = sanitizeCustomerPromo2x1(line || {});
        bowlLines.push({
          kind: "promo2x1",
          catalogId: "promo-2x1-bowls",
          ...promo,
          price: PROMO_2X1_BOWLS_PRICE,
          qty: 1,
        });
      } catch (promoError) {
        throw new TypeError(`2x1 en Bowls (línea ${index + 1}): ${promoError.message}`);
      }
    } else {
      try {
        const bowl = sanitizeCustomerBowl(line || {});
        bowlLines.push({ kind: "bowl", ...bowl, price: priceCustomerBowl(bowl), qty: 1 });
      } catch (bowlError) {
        throw new TypeError(`Bowl ${index + 1}: ${bowlError.message}`);
      }
    }
  });

  const itemLines = rawItemLines.length > 0
    ? resolvePosItems(rawItemLines).map((item) => ({
        kind: "item",
        catalogId: item.catalogId,
        name: item.name,
        price: item.price,
        qty: item.qty,
        ...(item.catalogId === "combo-palace" ? {
          comboBowlId: item.comboBowlId,
          comboDrinkId: item.comboDrinkId,
          comboRiceCakeId: item.comboRiceCakeId,
        } : {}),
      }))
    : [];

  return [...bowlLines, ...itemLines];
}

// Como findUnavailableCustomerBowlItems, pero para un carrito completo — cada
// línea de bowl se revisa igual que hoy; las líneas de artículo reutilizan
// getUnavailablePosSelections (misma revisión que ya usa el POS).
export function findUnavailableCustomerCartItems(cart, unavailableItems) {
  if (!Array.isArray(cart) || cart.length === 0) return [];

  const found = new Set();
  for (const line of cart) {
    if (line.kind === "item") {
      for (const id of getUnavailablePosSelections({ items: [line], unavailableItems })) {
        found.add(id);
      }
    } else if (line.kind === "promo2x1") {
      for (const id of findUnavailablePromo2x1Items(line, unavailableItems)) {
        found.add(id);
      }
    } else {
      for (const id of findUnavailableCustomerBowlItems(line, unavailableItems)) {
        found.add(id);
      }
    }
  }
  return [...found].sort();
}

export function normalizeCustomerOrderId(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new TypeError("clientOrderId no es válido");
  const normalized = value.trim();
  if (!CUSTOMER_ORDER_ID_PATTERN.test(normalized)) {
    throw new TypeError("clientOrderId no es válido");
  }
  return normalized;
}

// Abre los 7 días. Viernes, sábado y domingo abren una hora antes que el
// resto de la semana; el cierre es el mismo todos los días.
const EARLY_OPEN_WEEKDAYS = new Set([0, 5, 6]); // domingo, viernes, sábado
export const RESTAURANT_OPEN_HOUR = 11;
export const RESTAURANT_EARLY_OPEN_HOUR = 10;
export const RESTAURANT_CLOSE_HOUR = 21;

export function restaurantOpenHour(date = new Date()) {
  return EARLY_OPEN_WEEKDAYS.has(zonedWeekday(date)) ? RESTAURANT_EARLY_OPEN_HOUR : RESTAURANT_OPEN_HOUR;
}

export function isWithinRestaurantHours(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const { hour } = zonedParts(date);
  return hour >= restaurantOpenHour(date) && hour < RESTAURANT_CLOSE_HOUR;
}

export function isCustomerManagedOrder(order) {
  return order?.source === "online" || order?.source === "whatsapp";
}

export function usefulPointsToRedeem({
  availablePoints,
  requestedPoints,
  orderTotal,
  pointsPerReward = 100,
  rewardValue = 25,
}) {
  const available = Number(availablePoints);
  const requested = Number(requestedPoints);
  const total = Number(orderTotal);
  if (
    !Number.isFinite(available) ||
    !Number.isFinite(requested) ||
    !Number.isFinite(total) ||
    available < pointsPerReward ||
    requested < pointsPerReward ||
    total < rewardValue
  ) {
    return 0;
  }

  const availableBlocks = Math.floor(Math.max(0, available) / pointsPerReward);
  const requestedBlocks = Math.floor(Math.max(0, requested) / pointsPerReward);
  const usefulBlocks = Math.floor(Math.max(0, total) / rewardValue);
  return Math.min(availableBlocks, requestedBlocks, usefulBlocks) * pointsPerReward;
}
