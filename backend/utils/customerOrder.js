import { zonedParts } from "./timeZone.js";

export const CUSTOMER_ORDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;

const BOWL_CATALOG = Object.freeze({
  base: new Set(["white_rice", "brown_rice", "quinoa", "spring_mix"]),
  proteins: new Set(["tuna", "salmon", "shrimp", "tofu", "octopus", "seared_tuna"]),
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
  protein,
  proteins,
  complements,
  sauces,
  toppings,
  extraScoopProteins,
}) {
  if (typeof base !== "string" || !BOWL_CATALOG.base.has(base)) {
    throw new TypeError("Selecciona una base válida");
  }
  const proteinInput = Array.isArray(proteins)
    ? proteins
    : typeof protein === "string" && protein
      ? [protein]
      : [];
  const safeProteins = normalizeCatalogList(proteinInput, "proteins", 3);
  if (safeProteins.length < 1) throw new TypeError("Selecciona al menos 1 proteína");

  return {
    base,
    proteins: safeProteins,
    // Los marinados ya no forman parte del armador — cualquier valor
    // enviado por el cliente (favoritos o pedidos repetidos antiguos) se
    // ignora en vez de validarse.
    marinades: [],
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
    bowl.base,
    ...(Array.isArray(bowl.proteins) ? bowl.proteins : []),
    ...(Array.isArray(bowl.complements) ? bowl.complements : []),
    ...(Array.isArray(bowl.sauces) ? bowl.sauces : []),
    ...(Array.isArray(bowl.toppings) ? bowl.toppings : []),
    ...(Array.isArray(bowl.extraScoopProteins) ? bowl.extraScoopProteins : []),
  ];

  return [...new Set(selectedIds.filter((item) => unavailable.has(item)))];
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

export function isWithinRestaurantHours(date = new Date(), openHour = 11, closeHour = 21) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const { hour } = zonedParts(date);
  return hour >= openHour && hour < closeHour;
}

export function isCustomerManagedOrder(order) {
  return order?.source === "online";
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
