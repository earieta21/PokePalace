import { POS_MENU } from "../pos/posMenu.js";

// Artículos de venta rápida del POS sin receta específica (para cuando el
// personal no tiene tiempo de capturar el bowl completo, ej. fila larga) —
// no tienen sentido como elección deliberada de un cliente armando su
// pedido con calma. El backend rechaza estos mismos ids de forma
// independiente (ver CUSTOMER_EXCLUDED_CATALOG_IDS en
// backend/utils/customerOrder.js) — nunca confiar solo en este filtro.
const CUSTOMER_EXCLUDED_CATALOG_IDS = new Set([
  "bowl-mediano-rapido",
  "bowl-grande-rapido",
]);

// Catálogo de artículos que un cliente puede agregar directo al carrito sin
// pasar por el armador: bowls de la casa (receta fija, igual que en el POS),
// entradas y bebidas. Mismos datos que ya usa el POS (`POS_MENU`), filtrando
// los artículos exclusivos de venta rápida en mostrador.
export const CUSTOMER_CATALOG = Object.freeze(
  POS_MENU.filter((item) => !CUSTOMER_EXCLUDED_CATALOG_IDS.has(item.catalogId))
);

export const CUSTOMER_CATALOG_CATEGORIES = Object.freeze(["Bowls", "Entradas", "Bebidas"]);

export const houseBowls = CUSTOMER_CATALOG.filter((item) => item.categoryKey === "bowls");