import { BOWL_BASE_PRICE, LARGE_BOWL_UPCHARGE } from "../order/pricing.js";

// availabilityKeys mirrors the ingredients used by each prepared item so the
// POS can stop a sale before the server performs its authoritative check.
export const POS_MENU = Object.freeze([
  {
    id: 1,
    catalogId: "bowl-emerald-salmon",
    name: "Bowl de salmón esmeralda",
    price: BOWL_BASE_PRICE,
    category: "Bowls",
    categoryKey: "bowls",
    icon: "🍣",
    availabilityKeys: [
      "bowl_de_salmon_esmeralda", "white_rice", "salmon", "tuna", "avocado",
      "cucumber", "edamame", "spicy_mayo", "citrus_dressing", "sesame_seeds", "nori_strips",
    ],
  },
  {
    id: 2,
    catalogId: "bowl-spicy-tuna",
    name: "Bowl picante de atún crujiente",
    price: BOWL_BASE_PRICE,
    category: "Bowls",
    categoryKey: "bowls",
    icon: "🌶️",
    availabilityKeys: [
      "bowl_picante_de_atun_crujiente", "quinoa", "tuna", "salmon", "cucumber",
      "edamame", "spicy_surimi", "sriracha", "spicy_mayo", "masago", "nori_strips",
    ],
  },
  {
    id: 3,
    catalogId: "bowl-tropical-shrimp",
    name: "Bowl tropical de camarón",
    price: BOWL_BASE_PRICE,
    category: "Bowls",
    categoryKey: "bowls",
    icon: "🍤",
    availabilityKeys: [
      "bowl_tropical_de_camaron", "spring_mix", "shrimp", "tofu", "pineapple",
      "avocado", "cucumber", "sweet_dressing", "cilantro_dressing", "sesame_seeds", "masago",
    ],
  },
  {
    // The legacy numeric id stays stable so pending offline sales keep resolving.
    id: 4,
    catalogId: "bowl-citrus-tofu",
    name: "Tofu Cítrico",
    price: BOWL_BASE_PRICE,
    category: "Bowls",
    categoryKey: "bowls",
    icon: "🥢",
    availabilityKeys: [
      "tofu_citrico", "spring_mix", "tofu", "shrimp",
      "cucumber", "beet", "avocado", "citrus_dressing", "cilantro_dressing", "sesame_seeds", "nori_strips",
    ],
  },
  // Venta rápida sin ingredientes específicos — para cuando no hay tiempo
  // de armar el bowl personalizado en el momento (ej. fila larga). Solo
  // cobra el precio correcto; no descuenta inventario por receta.
  {
    id: 20,
    catalogId: "bowl-mediano-rapido",
    name: "Bowl mediano",
    price: BOWL_BASE_PRICE,
    category: "Bowls",
    categoryKey: "bowls",
    icon: "🥗",
    availabilityKeys: [],
  },
  {
    id: 21,
    catalogId: "bowl-grande-rapido",
    name: "Bowl grande",
    price: BOWL_BASE_PRICE + LARGE_BOWL_UPCHARGE,
    category: "Bowls",
    categoryKey: "bowls",
    icon: "🥗",
    availabilityKeys: [],
  },
  {
    id: 6,
    catalogId: "edamame",
    name: "Edamame",
    price: 69,
    category: "Entradas",
    categoryKey: "starters",
    icon: "🫛",
    availabilityKeys: ["edamame"],
  },
  {
    id: 8,
    catalogId: "seaweed-salad",
    name: "Ensalada de Algas",
    price: 79,
    category: "Entradas",
    categoryKey: "starters",
    icon: "🥗",
    availabilityKeys: ["seaweed", "ensalada_de_algas"],
  },
  {
    id: 11,
    catalogId: "mineral-water",
    name: "Topochico",
    price: 35,
    category: "Bebidas",
    categoryKey: "drinks",
    icon: "🫧",
    availabilityKeys: ["topochico", "agua_mineral"],
  },
  {
    id: 13,
    catalogId: "coca-zero",
    name: "Coca-Zero",
    price: 30,
    category: "Bebidas",
    categoryKey: "drinks",
    icon: "🥤",
    availabilityKeys: ["coca_zero"],
  },
  {
    id: 14,
    catalogId: "bottled-water",
    name: "Botella de Agua",
    price: 20,
    category: "Bebidas",
    categoryKey: "drinks",
    icon: "💧",
    availabilityKeys: ["botella_de_agua"],
  },
  {
    id: 15,
    catalogId: "agua-del-dia",
    name: "Agua del día",
    price: 35,
    category: "Bebidas",
    categoryKey: "drinks",
    icon: "🥤",
    rewardDrink: true,
    availabilityKeys: ["agua_natural", "agua_del_dia"],
  },
]);

export const POS_MENU_CATEGORIES = Object.freeze(["Todos", "Bowls", "Entradas", "Bebidas"]);

export const POS_REWARD_TOPPING_IDS = Object.freeze([
  "black_olives",
  "toasted_peanuts",
  "sesame_seeds",
  "nori_strips",
  "masago",
  "croutons",
]);
