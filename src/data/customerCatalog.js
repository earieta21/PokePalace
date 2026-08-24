import theOg from "../assets/menu/theOg.webp";
import skinnyBowl from "../assets/menu/skinnyBowl.webp";
import quinoaBowl from "../assets/menu/quinoaBowl.webp";
import topoChico from "../assets/menu/products/topo-chico.jpg";
import cocaZero from "../assets/menu/products/coca-zero.jpg";
import bottledWater from "../assets/menu/products/bottled-water.jpg";
import aguaDelDia from "../assets/menu/products/agua-del-dia.jpg";
import cacaoRiceCake from "../assets/menu/products/cacao-rice-cake.jpg";
import chocoRiceCake from "../assets/menu/products/choco-rice-cake.jpg";

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
    catalogId: "bowl-the-og",
    name: "The OG",
    price: 230,
    category: "Bowls",
    categoryKey: "bowls",
    icon: "🍣",
    image: theOg,
  },
  {
    catalogId: "bowl-skinny",
    name: "Skinny Bowl",
    price: 230,
    category: "Bowls",
    categoryKey: "bowls",
    icon: "🥗",
    image: skinnyBowl,
  },
  {
    catalogId: "bowl-quinoa",
    name: "Quinoa Bowl",
    price: 230,
    category: "Bowls",
    categoryKey: "bowls",
    icon: "🍤",
    image: quinoaBowl,
  },
  {
    catalogId: "mineral-water",
    name: "Topochico",
    price: 35,
    category: "Bebidas",
    categoryKey: "drinks",
    icon: "🫧",
    image: topoChico,
    imageFit: "contain",
  },
  {
    catalogId: "coca-zero",
    name: "Coca-Zero",
    price: 30,
    category: "Bebidas",
    categoryKey: "drinks",
    icon: "🥤",
    image: cocaZero,
    imageFit: "contain",
  },
  {
    catalogId: "bottled-water",
    name: "Botella de Agua",
    price: 20,
    category: "Bebidas",
    categoryKey: "drinks",
    icon: "💧",
    image: bottledWater,
    imageFit: "contain",
  },
  {
    catalogId: "agua-del-dia",
    name: "Agua del día",
    price: 35,
    category: "Bebidas",
    categoryKey: "drinks",
    icon: "🥤",
    image: aguaDelDia,
  },
  {
    catalogId: "cacao-rice-cake",
    name: "Cacao Rice Cake",
    price: 30,
    category: "Extras",
    categoryKey: "extras",
    icon: "🍫",
    image: cacaoRiceCake,
  },
  {
    catalogId: "choco-rice-cake",
    name: "Choco Rice Cake",
    price: 35,
    category: "Extras",
    categoryKey: "extras",
    icon: "🍫",
    image: chocoRiceCake,
  },
  {
    catalogId: "miel-rice-cake",
    name: "Miel Rice Cake",
    price: 35,
    category: "Extras",
    categoryKey: "extras",
    icon: "🍯",
    // Sin foto todavía — se ve bien con solo el ícono (MenuBrowser.jsx
    // cae a la tarjeta "solo ícono" cuando no hay `image`). Agregar aquí
    // cuando haya una foto con licencia verificada, como las demás.
  },
]);

export const CUSTOMER_CATALOG_CATEGORIES = Object.freeze(["Bowls", "Bebidas", "Extras"]);
