// Fuente de verdad — esta es la copia que de verdad cobra los puntos.
// El frontend tiene su propia copia en src/data/rewardsCatalog.js, solo
// para mostrar los premios. No importar este archivo desde src/ — mezclar
// el árbol del frontend (Vite/Netlify) con el del backend (Render) es
// frágil: un cambio aquí pensado solo para el backend podría tronar el
// build del sitio sin aviso. Si cambias un premio, actualiza ambos archivos.
export const REWARDS = [
  {
    id: 1,
    cost: 50,
    icon: "🥤",
    name: { es: "Bebida gratis", en: "Free drink" },
    desc: { es: "Agua del día", en: "Agua fresca of the day" },
    terms: { es: "Con la compra de un bowl. Agrega la bebida a la orden.", en: "With a bowl purchase. Add the drink to the order." },
    type: "free_drink",
  },
  {
    id: 2,
    cost: 75,
    icon: "✨",
    name: { es: "Topping extra", en: "Extra topping" },
    desc: { es: "Cualquier topping de tu elección", en: "Any topping of your choice" },
    terms: { es: "Con la compra de un bowl. Un topping adicional.", en: "With a bowl purchase. One additional topping." },
    type: "extra_topping",
  },
  {
    id: 4,
    cost: 200,
    icon: "✨",
    name: { es: "Proteína doble", en: "Double protein" },
    desc: { es: "Doble porción de proteína en tu bowl", en: "Double protein portion in your bowl" },
    terms: { es: "En bowl personalizado grande. Descuenta el cargo de $40.", en: "On a large custom bowl. Waives the $40 upgrade." },
    type: "double_protein",
  },
  {
    id: 3,
    cost: 300,
    icon: "🥗",
    name: { es: "Bowl gratis", en: "Free bowl" },
    desc: { es: "Un bowl completo de tu elección", en: "A full bowl of your choice" },
    terms: { es: "Cubre hasta $230. Tamaño grande y extras se cobran.", en: "Covers up to $230. Large size and extras cost extra." },
    type: "free_bowl",
  },
];

export const STORY_REWARD = {
  id: 101,
  cost: 0,
  icon: "🥤",
  name: { es: "Bebida por historia", en: "Story drink" },
  desc: { es: "Agua del día", en: "Agua fresca of the day" },
  terms: {
    es: "Con la compra de un bowl. Agrega la bebida a la orden. Válido por 7 días, una vez cada 30 días y no acumulable.",
    en: "With a bowl purchase. Add the drink to the order. Valid for 7 days, once every 30 days, and cannot be combined.",
  },
  type: "free_drink",
  source: "social_story",
};

export const getRewardById = (rewardId) =>
  [...REWARDS, STORY_REWARD].find((reward) => reward.id === Number(rewardId)) ?? null;
