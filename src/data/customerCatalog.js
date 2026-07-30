// Catálogo de artículos que un cliente puede agregar directo al carrito sin
// pasar por el armador: bowls de la casa (receta fija), bebidas y extras.
// Mismos catalogId/nombre/precio que backend/config/posCatalog.js (fuente de
// verdad — el servidor siempre vuelve a calcular el precio, esto es solo
// para mostrar). Se excluyen a propósito "bowl-mediano-rapido" y
// "bowl-grande-rapido": son venta rápida sin receta específica para cuando
// el personal no tiene tiempo de capturar el bowl completo, no tienen
// sentido como elección deliberada de un cliente armando su pedido con
// calma — el backend rechaza esos mismos ids de forma independiente (ver
// CUSTOMER_EXCLUDED_CATALOG_IDS en backend/utils/customerOrder.js).
export const CUSTOMER_CATALOG = Object.freeze([
  {
    catalogId: "bowl-emerald-salmon",
    name: "Bowl de salmón esmeralda",
    price: 230,
    category: "Bowls",
    categoryKey: "bowls",
    icon: "🍣",
  },
  {
    catalogId: "bowl-spicy-tuna",
    name: "Bowl picante de atún crujiente",
    price: 230,
    category: "Bowls",
    categoryKey: "bowls",
    icon: "🌶️",
  },
  {
    catalogId: "bowl-tropical-shrimp",
    name: "Bowl tropical de camarón",
    price: 230,
    category: "Bowls",
    categoryKey: "bowls",
    icon: "🍤",
  },
  {
    catalogId: "mineral-water",
    name: "Topochico",
    price: 35,
    category: "Bebidas",
    categoryKey: "drinks",
    icon: "🫧",
  },
  {
    catalogId: "coca-zero",
    name: "Coca-Zero",
    price: 30,
    category: "Bebidas",
    categoryKey: "drinks",
    icon: "🥤",
  },
  {
    catalogId: "bottled-water",
    name: "Botella de Agua",
    price: 20,
    category: "Bebidas",
    categoryKey: "drinks",
    icon: "💧",
  },
  {
    catalogId: "agua-del-dia",
    name: "Agua del día",
    price: 35,
    category: "Bebidas",
    categoryKey: "drinks",
    icon: "🥤",
  },
  {
    catalogId: "cacao-rice-cake",
    name: "Cacao Rice Cake",
    price: 30,
    category: "Extras",
    categoryKey: "extras",
    icon: "🍫",
  },
  {
    catalogId: "choco-rice-cake",
    name: "Choco Rice Cake",
    price: 35,
    category: "Extras",
    categoryKey: "extras",
    icon: "🍫",
  },
]);

export const CUSTOMER_CATALOG_CATEGORIES = Object.freeze(["Bowls", "Bebidas", "Extras"]);
