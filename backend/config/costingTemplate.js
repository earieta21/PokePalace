/* Datos iniciales de costeo tomados de la hoja "POKE PALACE INV INSUMOS"
   (Google Sheets, hojas Costos y REQUISICION, nov 2026). Se cargan con un
   botón en Costeo para que nadie tenga que teclearlos: solo llenan lo que
   está vacío y nunca sobrescriben lo que ya se capturó.

   Las recetas van tal cual la hoja (paquete, cuánto se usa, precio del
   paquete); el costo lo calcula la app, así que los errores de cuenta de la
   hoja no se arrastran. Los rendimientos en porciones NO venían en la hoja:
   las recetas quedan como "falta rendimiento" para que la cocina lo mida. */
const line = (name, unit, presentation, recipeAmount, unitPrice) => ({
  name, unit, presentation, recipeAmount, unitPrice, flatCost: 0, inventoryItemId: null,
});
const flat = (name, flatCost) => ({
  name, unit: "pz", presentation: 0, recipeAmount: 0, unitPrice: 0, flatCost, inventoryItemId: null,
});

const SURIMI_BASE = [
  line("Surimi", "gr", 1150, 1150, 215),
  line("Crema", "kg", 5, 250, 357),
  line("Mayonesa", "kg", 3.35, 250, 237.8),
  flat("Limón (1 oz)", 2),
  flat("Aceite de ajonjolí (1 oz)", 2.15),
];

export const TEMPLATE_RECIPES = [
  {
    name: "SPICY MAYO",
    tipologia: "aderezo",
    menuKey: "spicy_mayo",
    notes: "Rinde 1.25 L según la hoja de insumos. Falta cuántas porciones (p. ej. 41 si la porción es de 1 oz / 30 ml).",
    ingredients: [
      line("Crema", "kg", 5, 417, 357),
      line("Mayonesa", "kg", 3.35, 616, 237.8),
      line("Chipotle", "kg", 1.5, 117, 249),
      line("Sriracha", "gr", 793, 25, 80),
      line("Chile Toban", "gr", 368, 104, 150),
    ],
  },
  {
    name: "ADEREZO DE CILANTRO",
    tipologia: "aderezo",
    menuKey: "cilantro_dressing",
    notes: "De la hoja de insumos. Falta cuántas porciones rinde el lote.",
    ingredients: [
      line("Crema", "kg", 5, 425, 357),
      line("Mayonesa", "kg", 3.35, 285, 237.8),
      flat("Cilantro (3 manojos)", 24),
      flat("Ajo", 5),
      flat("Sal", 1),
    ],
  },
  {
    name: "MARINADO DULCE",
    tipologia: "marinado",
    menuKey: "sweet_marinade",
    notes: "De la hoja de insumos. Falta cuántas porciones rinde el lote.",
    ingredients: [
      line("Azúcar", "kg", 1, 1000, 22.5),
      line("Soya", "lt", 1.89, 313, 250),
      line("Miel", "kg", 5, 100, 470),
      line("Aceite de ajonjolí", "lt", 3.8, 63, 276),
      line("Agua", "lt", 20, 1000, 30),
    ],
  },
  {
    name: "SURIMI",
    tipologia: "mezcla",
    menuKey: "surimi",
    notes: "Porción de 40 g. Pesa el lote terminado y divide entre 40 para el rendimiento.",
    ingredients: SURIMI_BASE,
  },
  {
    name: "SPICY SURIMI",
    tipologia: "mezcla",
    menuKey: "spicy_surimi",
    notes: "Porción de 40 g. Pesa el lote terminado y divide entre 40 para el rendimiento.",
    ingredients: [
      ...SURIMI_BASE,
      line("Sriracha", "kg", 1.5, 100, 80),
      line("Chile Toban", "gr", 793, 35, 150),
    ],
  },
];

// Porción de cada opción y su precio de compra (respaldo: si el inventario
// tiene el artículo con costo, ese manda y se actualiza solo).
export const TEMPLATE_PORTIONS = {
  shredded_carrots: { amount: 30, unit: "g", price: 23, priceUnit: "kg" },
  cucumber: { amount: 20, unit: "g", price: 29.9, priceUnit: "kg" },
  pineapple: { amount: 20, unit: "g", price: 65, priceUnit: "kg" },
  red_onion: { amount: 20, unit: "g", price: 27, priceUnit: "kg" },
  // ¼ de pieza; la hoja da $2.75 por porción → $11 la pieza.
  avocado: { amount: 0.25, unit: "pz", price: 11, priceUnit: "pz" },
  seaweed: { amount: 40, unit: "g", price: 320, priceUnit: "kg" },
  edamame: { amount: 40, unit: "g", price: 50, priceUnit: "kg" },
  surimi: { amount: 40, unit: "g" },
  spicy_surimi: { amount: 40, unit: "g" },
  nori_strips: { amount: 1, unit: "g", price: 310, priceUnit: "kg" },
  croutons: { amount: 13, unit: "g", price: 219, priceUnit: "kg" },
  crispy_onions: { amount: 12, unit: "g", price: 158, priceUnit: "kg" },
  toasted_peanuts: { amount: 13, unit: "g", price: 70, priceUnit: "kg" },
  toasted_coconut: { amount: 7, unit: "g", price: 195, priceUnit: "kg" },
  sesame_seeds: { amount: 4, unit: "g", price: 120, priceUnit: "kg" },
};

// Desechables del "servicio completo" de la hoja (precio del paquete).
export const TEMPLATE_DISPOSABLES = [
  { name: "Bowl 32 oz", category: "Contenedores", piecesPerPack: 45, packPrice: 210, appliesTo: "all", aliases: ["bowl 32 oz", "bowls 32 oz", "bowl 32oz", "tira/bowl 32 oz/45 pz"] },
  { name: "Tapa bowl 32 oz", category: "Tapas", piecesPerPack: 45, packPrice: 120, appliesTo: "all", aliases: ["tapa bowl 32 oz", "tapas 32 oz", "tapa 32 oz", "tapa de bowl 32 oz"] },
  { name: "Tenedor desechable", category: "Cubiertos", piecesPerPack: 280, packPrice: 224, appliesTo: "all", aliases: ["tenedor", "tenedores", "tenedor desechable"] },
  { name: "Servilleta blanca", category: "Servilletas", piecesPerPack: 1000, packPrice: 217, appliesTo: "all", aliases: ["servilleta", "servilletas", "servilleta blanca"] },
  { name: "Bolsa café", category: "Bolsas", piecesPerPack: 26, packPrice: 150, appliesTo: "togo", aliases: ["bolsa cafe", "bolsas cafe", "bolsa", "bolsas 30#"] },
  { name: "Contenedor 1 oz", category: "Contenedores", piecesPerPack: 50, packPrice: 15, appliesTo: "per_sauce", aliases: ["contenedor 1 oz", "contenedores 1 oz", "vasito 1 oz"] },
  { name: "Tapa 1 oz", category: "Tapas", piecesPerPack: 125, packPrice: 33, appliesTo: "per_sauce", aliases: ["tapa 1 oz", "tapas 1 oz"] },
];

const normalize = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .replace(/\s+/g, " ");

const hasPortion = (entry) => Boolean(entry) && ((Number(entry.amount) || 0) > 0 || (Number(entry.price) || 0) > 0);

/**
 * Qué haría la plantilla con lo que ya existe, sin tocar nada. Puro: recibe
 * el estado actual y regresa el plan, para mostrarlo antes de aplicarlo.
 *   preparations: [{ menuKey }]
 *   portions: { key: entry }
 *   disposables: [{ _id, name }]   (catálogo de Desechables)
 *   lines: [{ disposableId }]      (desechables ya en el costeo)
 */
export function planCostingTemplate({ preparations = [], portions = {}, disposables = [], lines = [] }) {
  const recipeKeys = new Set(preparations.map((prep) => prep.menuKey).filter(Boolean));
  const linedIds = new Set(lines.map((entry) => String(entry.disposableId)));

  const recipes = TEMPLATE_RECIPES.map((recipe) => ({
    name: recipe.name,
    menuKey: recipe.menuKey,
    action: recipeKeys.has(recipe.menuKey) ? "existe" : "crear",
  }));

  const portionPlan = Object.entries(TEMPLATE_PORTIONS).map(([key, entry]) => ({
    key,
    amount: entry.amount,
    unit: entry.unit,
    price: entry.price || 0,
    priceUnit: entry.priceUnit || null,
    action: hasPortion(portions?.[key]) ? "existe" : "crear",
  }));

  const disposablePlan = TEMPLATE_DISPOSABLES.map((template) => {
    const names = new Set([template.name, ...template.aliases].map(normalize));
    const match = disposables.find((item) => names.has(normalize(item.name)));
    const id = match ? String(match._id) : null;
    return {
      name: template.name,
      existingId: id,
      existingName: match?.name || null,
      action: !match ? "crear" : linedIds.has(id) ? "existe" : "agregar",
    };
  });

  const pending = [...recipes, ...portionPlan, ...disposablePlan].filter((entry) => entry.action !== "existe").length;
  return { recipes, portions: portionPlan, disposables: disposablePlan, pending };
}

