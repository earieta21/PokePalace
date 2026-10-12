// Plataformas de delivery que el cajero elige en el POS cuando la entrega es
// "Delivery". Los ids deben coincidir con DELIVERY_PLATFORMS en
// backend/config/posCatalog.js. `app: true` = la plataforma cobra al cliente
// y nos liquida después, así que la venta no pasa por caja ni terminal.
export const DELIVERY_PLATFORMS = [
  { id: "uber_eats", label: "Uber Eats", app: true },
  { id: "didi_food", label: "DiDi Food", app: true },
  { id: "rappi", label: "Rappi", app: true },
  { id: "propio", label: "Repartidor propio", app: false },
];

export const DELIVERY_PLATFORM_LABELS = Object.fromEntries(
  DELIVERY_PLATFORMS.map((platform) => [platform.id, platform.label])
);

export const isDeliveryApp = (id) =>
  DELIVERY_PLATFORMS.some((platform) => platform.id === id && platform.app);
