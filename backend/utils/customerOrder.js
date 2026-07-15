import { zonedParts } from "./timeZone.js";

export const CUSTOMER_ORDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;

const BOWL_CATALOG = Object.freeze({
  base: new Set(["white_rice", "brown_rice", "quinoa", "spring_mix"]),
  proteins: new Set(["tuna", "salmon", "shrimp", "octopus", "seared_tuna"]),
  marinades: new Set([
    "citrus_marinade", "shoyu_marinade", "ponzu_marinade", "spicy_marinade",
    "sesame_marinade", "wasabi_marinade", "miso_marinade", "garlic_ginger_marinade",
  ]),
  complements: new Set([
    "shredded_carrots", "cucumber", "mango", "jicama", "seaweed", "avocado",
    "edamame", "kale", "peas", "corn", "pineapple", "chia_seeds",
  ]),
  sauces: new Set([
    "spicy_mayo", "soy_sauce", "ponzu_sauce", "sesame_ginger", "wasabi_vinaigrette",
    "sweet_chili", "garlic_sriracha", "avocado_lime", "miso_dressing", "yuzu_kosho",
  ]),
  toppings: new Set([
    "sesame_seeds", "crispy_onions", "nori_strips", "red_pepper_flakes",
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

export function sanitizeCustomerBowl({
  base,
  protein,
  proteins,
  marinades,
  complements,
  sauces,
  toppings,
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
    marinades: normalizeCatalogList(marinades, "marinades", 2),
    complements: normalizeCatalogList(complements, "complements", 6),
    sauces: normalizeCatalogList(sauces, "sauces", 2),
    toppings: normalizeCatalogList(toppings, "toppings", 5),
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
    ...(Array.isArray(bowl.marinades) ? bowl.marinades : []),
    ...(Array.isArray(bowl.complements) ? bowl.complements : []),
    ...(Array.isArray(bowl.sauces) ? bowl.sauces : []),
    ...(Array.isArray(bowl.toppings) ? bowl.toppings : []),
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
