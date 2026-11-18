// "¿Algo para acompañar?" en el resumen, antes de pagar (kiosco y web): una
// bebida, la sopa miso y un rice cake, cada uno con un toque.
//
// Solo aparece si el pedido trae algún bowl (armado, de la casa o el 2x1) y
// no trae el Combo Palace, que ya incluye bebida y rice cake. De cada grupo
// se ofrece lo primero de la lista que esté disponible hoy, y nada más si el
// pedido todavía no trae algo de ese grupo.
//
// Sin imports de catálogo (trae fotos) para poder probarlo en Node: la
// categoría de cada artículo la pasa quien llama.
export const SUGGESTION_SLOTS = Object.freeze([
  Object.freeze({
    category: "drinks",
    candidates: Object.freeze(["agua-del-dia", "coca-cola-regular", "mineral-water", "coca-zero", "bottled-water"]),
  }),
  Object.freeze({ category: "soups", candidates: Object.freeze(["miso-soup"]) }),
  Object.freeze({ category: "extras", candidates: Object.freeze(["choco-rice-cake", "miel-rice-cake"]) }),
]);

const COMBO_PALACE_ID = "combo-palace";

/* cart: líneas del carrito (OrderContext).
   categoryOf(catalogId): categoría del catálogo del cliente ("drinks",
     "bowls", "soups"...).
   isUnavailable(catalogId): agotado u oculto hoy.
   keepIds: lo que el cliente ya agregó desde estas sugerencias en esta
     visita. Su tarjeta se queda (con su contador) en vez de desaparecer en
     cuanto el pedido ya trae algo de ese grupo.
   Devuelve los catalogId a sugerir, en orden. */
export function checkoutSuggestionIds(cart, { categoryOf, isUnavailable = () => false, keepIds = [] } = {}) {
  const lines = Array.isArray(cart) ? cart : [];
  const items = lines.filter((line) => line?.kind === "item");
  const hasBowl = lines.some((line) => line?.kind === "bowl" || line?.kind === "promo2x1")
    || items.some((line) => categoryOf(line.catalogId) === "bowls");
  if (!hasBowl || items.some((line) => line.catalogId === COMBO_PALACE_ID)) return [];

  const keep = new Set(keepIds);
  return SUGGESTION_SLOTS.flatMap(({ category, candidates }) => {
    const kept = candidates.find((id) => keep.has(id));
    if (kept) return [kept];
    if (items.some((line) => categoryOf(line.catalogId) === category)) return [];
    const available = candidates.find((id) => !isUnavailable(id));
    return available ? [available] : [];
  });
}
