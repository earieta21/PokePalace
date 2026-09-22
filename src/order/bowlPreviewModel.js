// Fixed positions keep existing ingredients still when another one is added.
export const INGREDIENT_ART = {
  tuna: { shape: "cube", color: "#c64b54", x: 142, y: 148 },
  salmon: { shape: "salmon", color: "#ee8a51", x: 204, y: 150 },
  shrimp: { shape: "shrimp", color: "#f39b79", x: 173, y: 205 },
  tofu: { shape: "cube", color: "#ead8a7", x: 130, y: 206 },
  octopus: { shape: "ring", color: "#aa6170", x: 219, y: 207 },
  seared_tuna: { shape: "salmon", color: "#a86355", x: 179, y: 175 },
  shredded_carrots: { shape: "shred", color: "#ed932b", x: 109, y: 91 },
  seaweed: { shape: "shred", color: "#477444", x: 178, y: 73 },
  edamame: { shape: "bean", color: "#91b943", x: 243, y: 95 },
  red_onion: { shape: "onion", color: "#a75784", x: 279, y: 147 },
  cucumber: { shape: "cucumber", color: "#5f984e", x: 272, y: 210 },
  mango: { shape: "cube", color: "#f3b731", x: 226, y: 265 },
  pineapple: { shape: "cube", color: "#edda6d", x: 159, y: 280 },
  beet: { shape: "shred", color: "#9d3659", x: 99, y: 256 },
  surimi: { shape: "surimi", color: "#ed9277", x: 68, y: 204 },
  spicy_surimi: { shape: "shred", color: "#ec8b66", x: 70, y: 144 },
  avocado: { shape: "avocado", color: "#bfd779", x: 182, y: 113 },
  kale: { shape: "leaf", color: "#436f43", x: 106, y: 123 },
  peas: { shape: "bean", color: "#7d9e40", x: 245, y: 130 },
  corn: { shape: "bean", color: "#e8c451", x: 236, y: 234 },
  jicama: { shape: "shred", color: "#f4e9d2", x: 108, y: 231 },
  chia_seeds: { shape: "seed", color: "#50463c", x: 180, y: 180 },
};

export const SAUCE_COLORS = {
  spicy_mayo: "#edac7c",
  sriracha: "#be4629",
  cilantro_dressing: "#9fbb73",
  sweet_dressing: "#dab779",
  citrus_dressing: "#ddc36d",
  red_sauce: "#b74432",
  soy_sauce: "#65422c",
  ponzu_sauce: "#966339",
  sesame_ginger: "#c9a26c",
  wasabi_vinaigrette: "#a7bc76",
  sweet_chili: "#cd7040",
  garlic_sriracha: "#c55935",
  avocado_lime: "#b4c97d",
  miso_dressing: "#d9bb8d",
  yuzu_kosho: "#97a45a",
};

export const MARINADE_COLORS = {
  citrus_marinade: "#d8ad3f",
  spicy_marinade: "#c95534",
  sweet_marinade: "#a57136",
  shoyu_marinade: "#795239",
  ponzu_marinade: "#9e743a",
  sesame_marinade: "#bc9756",
  wasabi_marinade: "#98b45c",
  miso_marinade: "#c69d69",
  garlic_ginger_marinade: "#d6bb77",
};

export const TOPPING_ART = {
  black_olives: { shape: "ring", color: "#3e3830" },
  toasted_peanuts: { shape: "bean", color: "#c59658" },
  sesame_seeds: { shape: "seed", color: "#dac396" },
  nori_strips: { shape: "shred", color: "#354d36" },
  masago: { shape: "roe", color: "#ed792e" },
  croutons: { shape: "cube", color: "#c89347" },
  crispy_onions: { shape: "onion", color: "#ba803a" },
  red_pepper_flakes: { shape: "seed", color: "#a8442f" },
  pickled_radish: { shape: "ring", color: "#eab9ba" },
  toasted_coconut: { shape: "shred", color: "#eee0bc" },
  pumpkin_seeds: { shape: "seed", color: "#67814a" },
  furikake: { shape: "seed", color: "#41573c" },
};

const unique = (values) => [
  ...new Set(Array.isArray(values) ? values.filter(Boolean) : []),
];

export function getBowlLayers(order = {}) {
  const bases = unique(order.bases);
  return {
    bases: bases.length ? bases : order.base ? [order.base] : [],
    proteins: unique(order.proteins),
    complements: unique(order.complements),
    marinades: unique(order.marinades),
    sauces: unique(order.sauces),
    toppings: unique(order.toppings),
    extraScoops: Array.isArray(order.extraScoopProteins)
      ? order.extraScoopProteins
      : [],
  };
}

// Seeded positions: rerenders, reloads and multiple previews show the same bowl.
export function scatter(seed, count, radius = 105) {
  const hash = [...seed].reduce(
    (value, char) => (value * 31 + char.charCodeAt(0)) >>> 0,
    7,
  );
  return Array.from({ length: count }, (_, index) => {
    const angle = index * 2.399963 + ((hash % 360) * Math.PI) / 180;
    const distance = Math.sqrt((index + 0.5) / count) * radius;
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      rotation: (hash + index * 73) % 360,
    };
  });
}
