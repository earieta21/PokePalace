export const CUSTOM_BOWL_ID = "custom-bowl";
// Minimo 1: hay clientes que piden bowls con una sola proteina, al mismo
// precio ($230) que con 2 — ver BOWL_BASE_PRICE en order/pricing.js.
export const MIN_POS_PROTEINS = 1;
export const MAX_POS_PROTEINS = 3;

const BOWL_SELECTION_FIELDS = [
  "proteins",
  "marinades",
  "complements",
  "sauces",
  "toppings",
  "extraScoopProteins",
];

const cleanAvailability = (items) => new Set(
  (Array.isArray(items) ? items : [])
    .map((item) => String(item).trim())
    .filter(Boolean)
);

export function isBowlMenuItem(item) {
  return item?.categoryKey === "bowls" || item?.category === "Bowls";
}

export function isMenuItemUnavailable(item, unavailableItems) {
  const unavailable = cleanAvailability(unavailableItems);
  const keys = [item?.catalogId, item?.id, ...(item?.availabilityKeys || [])];
  return keys.some((key) => key !== undefined && key !== null && unavailable.has(String(key)));
}

export function getUnavailableBowlSelections(bowl, unavailableItems) {
  if (!bowl) return [];
  const unavailable = cleanAvailability(unavailableItems);
  const selected = Array.isArray(bowl.bases) && bowl.bases.length > 0
    ? [...bowl.bases]
    : [bowl.base];

  for (const field of BOWL_SELECTION_FIELDS) {
    selected.push(...(Array.isArray(bowl[field]) ? bowl[field] : []));
  }

  return [...new Set(selected.filter((item) => item && unavailable.has(String(item))))].sort();
}

export function getDoubleProteinExtraScoops(reward, bowl, selectedProtein) {
  const proteins = Array.isArray(bowl?.proteins) ? bowl.proteins : [];
  const isEligibleLargeBowl = bowl?.bowlSize === "large" && proteins.length === MAX_POS_PROTEINS;

  if (reward?.type !== "double_protein" || !isEligibleLargeBowl || !proteins.includes(selectedProtein)) {
    return [];
  }

  return [selectedProtein];
}
