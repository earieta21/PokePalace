import { ITEM_LABELS, getBaseLabel } from "./OrderLabels";
import {
  BOWL_BASE_PRICE,
  LARGE_BOWL_UPCHARGE,
  PROMO_2X1_BOWLS_PRICE,
} from "./pricing";

// Resumen del bowl que se está armando: qué lleva hasta ahora y cuánto va
// costando. Vive aparte porque el armador de la web (OrderPage.jsx) y el del
// kiosco (KioskOrderPage.jsx) muestran exactamente lo mismo — antes solo lo
// tenía la web y el kiosco dejaba al cliente sin saber en qué paso iba ni
// qué llevaba elegido.

// Lista de lo elegido, en el orden de los pasos del armador.
export function bowlSummaryParts(order, language) {
  const labels = ITEM_LABELS[language] || ITEM_LABELS.es;
  const parts = [];
  const join = (ids, map) => ids.map((id) => map?.[id] || id).join(", ");

  if (order.base) {
    parts.push({ icon: "🍚", text: getBaseLabel(order.bases, order.base, language) });
  }
  if (order.proteins?.length > 0) {
    parts.push({ icon: "🐟", text: join(order.proteins, labels.protein) });
  }
  if (order.marinades?.length > 0) {
    parts.push({ icon: "🧉", text: join(order.marinades, labels.marinade) });
  }
  if (order.complements?.length > 0) {
    parts.push({ icon: "🥗", text: join(order.complements, labels.complement) });
  }
  if (order.sauces?.length > 0) {
    parts.push({ icon: "🥣", text: join(order.sauces, labels.sauce) });
  }
  if (order.toppings?.length > 0) {
    parts.push({ icon: "✦", text: join(order.toppings, labels.topping) });
  }

  return parts;
}

// Lo que costará el bowl con lo elegido hasta ahora. Dentro de la promo 2x1
// el precio es plano por los 2 bowls, así que no depende del tamaño.
export function bowlDraftPrice(order) {
  if (order.promo2x1) {
    return { amount: PROMO_2X1_BOWLS_PRICE, isLarge: false, isPromo: true };
  }
  const isLarge = Array.isArray(order.proteins) && order.proteins.length >= 3;
  return {
    amount: isLarge ? BOWL_BASE_PRICE + LARGE_BOWL_UPCHARGE : BOWL_BASE_PRICE,
    isLarge,
    isPromo: false,
  };
}
