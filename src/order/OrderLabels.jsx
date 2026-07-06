export const BASE_LABELS = {
  white_rice:    "Arroz Blanco",
  brown_rice:    "Arroz Integral",
  quinoa:        "Quinoa",
  spring_mix:    "Mezcla verde",
  mixed_greens:  "Mezcla verde",
};

export const PROTEIN_LABELS = {
  tuna:        "Atún",
  salmon:      "Salmón",
  shrimp:      "Camarón",
  octopus:     "Pulpo",
  seared_tuna: "Atún Sellado",
};

export const MARINADE_LABELS = {
  citrus_marinade:        "Marinado Cítrico",
  shoyu_marinade:         "Marinado Shoyu",
  ponzu_marinade:         "Marinado Ponzu",
  spicy_marinade:         "Marinado Picante",
  sesame_marinade:        "Marinado de Sésamo",
  wasabi_marinade:        "Marinado de Wasabi",
  miso_marinade:          "Marinado de Miso",
  garlic_ginger_marinade: "Marinado de Ajo y Jengibre",
};

export const COMPLEMENT_LABELS = {
  shredded_carrots: "Zanahoria Rallada",
  cucumber:         "Pepino",
  mango:            "Mango",
  jicama:           "Jícama",
  seaweed:          "Algas",
  avocado:          "Aguacate",
  edamame:          "Edamame",
  kale:             "Col Rizada",
  peas:             "Chícharos",
  corn:             "Maíz",
  pineapple:        "Piña",
  chia_seeds:       "Semillas de Chía",
};

export const SAUCE_LABELS = {
  spicy_mayo:         "Mayonesa Picante",
  soy_sauce:          "Salsa de Soja",
  ponzu_sauce:        "Salsa Ponzu",
  sesame_ginger:      "Aderezo de Sésamo y Jengibre",
  wasabi_vinaigrette: "Vinagreta de Wasabi",
  sweet_chili:        "Salsa de Chile Dulce",
  garlic_sriracha:    "Salsa de Ajo y Sriracha",
  avocado_lime:       "Aderezo de Aguacate y Lima",
  miso_dressing:      "Aderezo de Miso",
  yuzu_kosho:         "Salsa Yuzu Kosho",
};

export const TOPPING_LABELS = {
  sesame_seeds:     "Ajonjolí",
  crispy_onions:    "Cebolla Crujiente",
  nori_strips:      "Tiras de Alga Nori",
  red_pepper_flakes:"Pimienta Roja en Hojuelas",
  pickled_radish:   "Rábano Encurtido",
  toasted_coconut:  "Copos de Coco Tostado",
  pumpkin_seeds:    "Pepitas",
  furikake:         "Furikake",
};

export const ITEM_LABELS = {
  es: {
    base: BASE_LABELS,
    protein: PROTEIN_LABELS,
    marinade: MARINADE_LABELS,
    complement: COMPLEMENT_LABELS,
    sauce: SAUCE_LABELS,
    topping: TOPPING_LABELS,
  },
  en: {
    base: {
      white_rice: "White Rice",
      brown_rice: "Brown Rice",
      quinoa: "Quinoa",
      spring_mix: "Mixed Greens (rice with greens)",
      mixed_greens: "Mixed Greens (rice with greens)",
    },
    protein: {
      tuna: "Tuna",
      salmon: "Salmon",
      shrimp: "Shrimp",
      octopus: "Octopus",
      seared_tuna: "Seared Tuna",
    },
    marinade: {
      citrus_marinade: "Citrus Marinade",
      shoyu_marinade: "Shoyu Marinade",
      ponzu_marinade: "Ponzu Marinade",
      spicy_marinade: "Spicy Marinade",
      sesame_marinade: "Sesame Marinade",
      wasabi_marinade: "Wasabi Marinade",
      miso_marinade: "Miso Marinade",
      garlic_ginger_marinade: "Garlic Ginger Marinade",
    },
    complement: {
      shredded_carrots: "Shredded Carrots",
      cucumber: "Cucumber",
      mango: "Mango",
      jicama: "Jicama",
      seaweed: "Seaweed",
      avocado: "Avocado",
      edamame: "Edamame",
      kale: "Kale",
      peas: "Peas",
      corn: "Corn",
      pineapple: "Pineapple",
      chia_seeds: "Chia Seeds",
    },
    sauce: {
      spicy_mayo: "Spicy Mayo",
      soy_sauce: "Soy Sauce",
      ponzu_sauce: "Ponzu Sauce",
      sesame_ginger: "Sesame Ginger Dressing",
      wasabi_vinaigrette: "Wasabi Vinaigrette",
      sweet_chili: "Sweet Chili Sauce",
      garlic_sriracha: "Garlic Sriracha Sauce",
      avocado_lime: "Avocado Lime Dressing",
      miso_dressing: "Miso Dressing",
      yuzu_kosho: "Yuzu Kosho Sauce",
    },
    topping: {
      sesame_seeds: "Sesame Seeds",
      crispy_onions: "Crispy Onions",
      nori_strips: "Nori Strips",
      red_pepper_flakes: "Red Pepper Flakes",
      pickled_radish: "Pickled Radish",
      toasted_coconut: "Toasted Coconut Flakes",
      pumpkin_seeds: "Pumpkin Seeds",
      furikake: "Furikake",
    },
  },
};

export const getItemLabel = (category, id, language = "es") => {
  if (!id) return "";
  return ITEM_LABELS[language]?.[category]?.[id] || ITEM_LABELS.es?.[category]?.[id] || id;
};
