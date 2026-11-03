// Título y descripción de cada página pública, para Google y la pestaña del
// navegador (los aplica CustomerLayout). Las páginas que no están aquí usan
// los de la portada. Deben coincidir con public/sitemap.xml, y el horario
// con backend/utils/customerOrder.js.
const HOME = {
  es: {
    title: "Poke Palace — Poke Bowls en Tijuana | Arma tu bowl",
    description: "Poke bowls frescos en Tijuana, abiertos todos los días de 11 AM a 9 PM. Arma tu bowl a tu gusto, pídelo en línea y recoge en minutos.",
  },
  en: {
    title: "Poke Palace — Poke Bowls in Tijuana | Build your bowl",
    description: "Fresh poke bowls in Tijuana, open every day from 11 AM to 9 PM. Build your bowl your way, order online and pick it up in minutes.",
  },
};

const PAGE_META = {
  "/": HOME,
  "/menu": {
    es: {
      title: "Menú · Poke Palace Tijuana",
      description: "Bowls de la casa, rice cakes y bebidas. Elige del menú o arma tu propio poke bowl y pídelo en línea para recoger.",
    },
    en: {
      title: "Menu · Poke Palace Tijuana",
      description: "House bowls, rice cakes and drinks. Pick from the menu or build your own poke bowl and order online for pickup.",
    },
  },
  "/order": {
    es: {
      title: "Arma tu bowl · Poke Palace Tijuana",
      description: "Elige base, proteínas, marinado, complementos, salsas y toppings, y pide tu poke bowl en línea para recoger.",
    },
    en: {
      title: "Build your bowl · Poke Palace Tijuana",
      description: "Choose your base, proteins, marinade, sides, sauces and toppings, and order your poke bowl online for pickup.",
    },
  },
  "/ubicaciones": {
    es: {
      title: "Ubicación y horario · Poke Palace Tijuana",
      description: "Blvd. Gustavo Díaz Ordaz, Plaza La Estación, Local 24, Tijuana. Abiertos todos los días de 11 AM a 9 PM, para recoger o comer aquí.",
    },
    en: {
      title: "Location and hours · Poke Palace Tijuana",
      description: "Blvd. Gustavo Díaz Ordaz, Plaza La Estación, Local 24, Tijuana. Open every day from 11 AM to 9 PM, for pickup or dine-in.",
    },
  },
  "/rewards-deals": {
    es: {
      title: "Premios y promociones · Poke Palace",
      description: "Ordena en Poke Palace, acumula puntos y canjéalos por premios. Revisa tus puntos, tu nivel y las promociones del momento.",
    },
    en: {
      title: "Rewards and deals · Poke Palace",
      description: "Order at Poke Palace, earn points and redeem them for rewards. Check your points, your tier and current deals.",
    },
  },
  "/aviso-de-privacidad": {
    es: {
      title: "Aviso de privacidad · Poke Palace",
      description: "Cómo Poke Palace recopila, usa y protege tus datos personales.",
    },
    en: {
      title: "Privacy policy · Poke Palace",
      description: "How Poke Palace collects, uses and protects your personal data.",
    },
  },
  "/terminos-de-servicio": {
    es: {
      title: "Términos de servicio · Poke Palace",
      description: "Condiciones para usar el sitio, hacer pedidos y participar en el programa de premios de Poke Palace.",
    },
    en: {
      title: "Terms of service · Poke Palace",
      description: "Terms for using the site, placing orders and taking part in the Poke Palace rewards program.",
    },
  },
};

export function pageMetaFor(pathname, language) {
  const page = PAGE_META[pathname] || HOME;
  return page[language] || page.es;
}
