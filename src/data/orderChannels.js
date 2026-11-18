// Canal de venta de un pedido, para mostrarlo en el portal.
//
// Los pedidos del kiosco se guardan con source "online" (se comportan igual
// que los de la web) y con fromKiosk: true; los de la web, con false. Los de
// antes de esa marca no tienen el campo: entre ellos, los del kiosco son los
// "online" sin teléfono desde el 13 sep 2026 (ese día el kiosco dejó de
// pedirlo; la web siempre lo exige).
//
// Misma regla que backend/utils/orderChannel.js, que la usa en Ventas: si
// cambia aquí, cambia allá.
export const ORDER_CHANNEL_LABELS = Object.freeze({
  pos: "POS",
  online: "En línea",
  kiosk: "Kiosco",
  whatsapp: "WhatsApp",
  delivery: "Delivery",
});

// 13 sep 2026, 00:00 en Tijuana (UTC-7 en horario de verano).
export const KIOSK_WITHOUT_PHONE_SINCE = Date.UTC(2026, 8, 13, 7);

export function orderChannel(order) {
  if (!order) return null;
  if (order.fromKiosk === true) return "kiosk";
  if (order.source !== "online") return order.source ?? null;
  if (order.fromKiosk === false) return "online";
  // Pedido de antes de la marca. Solo cuenta un teléfono vacío que sí vino
  // en la respuesta: si el servidor no lo manda (cocina, "Por cobrar"), no
  // hay cómo saberlo y se queda como "En línea".
  const createdAt = new Date(order.createdAt).getTime();
  return order.phone === "" && createdAt >= KIOSK_WITHOUT_PHONE_SINCE ? "kiosk" : "online";
}

export function orderChannelLabel(order) {
  const channel = orderChannel(order);
  return ORDER_CHANNEL_LABELS[channel] ?? channel ?? "";
}
