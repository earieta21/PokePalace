/* Canal de venta de un pedido, para los reportes.

   Los pedidos del kiosco se guardan con source "online": se comportan igual
   que los de la web (seguimiento con QR, puntos, cancelación, cobro en caja)
   y todo el código que revisa source === "online" debe seguir tratándolos
   así. Para separarlos en Ventas, createOrder les pone fromKiosk: true (y
   false a los de la web).

   Los pedidos de antes de esa marca no tienen el campo. Entre ellos, los del
   kiosco son los "online" sin teléfono desde el 13 sep 2026: ese día el
   kiosco dejó de pedirlo y la web siempre lo ha exigido.

   El portal usa la misma regla en src/data/orderChannels.js: si cambia aquí,
   cambia allá. */
import { mondayOfDateKey, shiftDateKey } from "./timeZone.js";

export const KIOSK_CHANNEL = "kiosk";

// 13 sep 2026, 00:00 en Tijuana (UTC-7 en horario de verano).
export const KIOSK_WITHOUT_PHONE_SINCE = new Date(Date.UTC(2026, 8, 13, 7));

// Semanas que muestra la tabla "Kiosco por semana" en Ventas.
export const KIOSK_WEEKS = 8;

// true si el pedido es del kiosco, para $group/$project de agregaciones.
export const IS_KIOSK_ORDER_EXPR = {
  $or: [
    { $eq: ["$fromKiosk", true] },
    {
      $and: [
        { $in: [{ $type: "$fromKiosk" }, ["missing", "null"]] },
        { $eq: ["$source", "online"] },
        { $eq: [{ $ifNull: ["$phone", ""] }, ""] },
        { $gte: ["$createdAt", KIOSK_WITHOUT_PHONE_SINCE] },
      ],
    },
  ],
};

// El canal para agrupar: "kiosk" o el source del pedido.
export const ORDER_CHANNEL_EXPR = { $cond: [IS_KIOSK_ORDER_EXPR, KIOSK_CHANNEL, "$source"] };

const round2 = (value) => Math.round(value * 100) / 100;

/* Arma las semanas (lunes a domingo, la actual al final) a partir de filas
   agrupadas por día y por si el pedido fue del kiosco:
   { _id: { day: "YYYY-MM-DD", kiosk: Boolean }, count, paidCount, revenue }.
   orders = pedidos del kiosco no cancelados; paidOrders y revenue = los ya
   cobrados (para el ticket promedio); allOrders = todos los pedidos de esa
   semana, de cualquier canal. */
export function buildKioskWeeks(dayRows, currentDateKey, weeks = KIOSK_WEEKS) {
  const currentWeekStart = mondayOfDateKey(currentDateKey);
  const buckets = Array.from({ length: weeks }, (_, index) => {
    const weekStart = shiftDateKey(currentWeekStart, -7 * (weeks - 1 - index));
    return {
      weekStart,
      weekEnd: shiftDateKey(weekStart, 6),
      current: index === weeks - 1,
      orders: 0,
      paidOrders: 0,
      revenue: 0,
      allOrders: 0,
    };
  });

  for (const row of dayRows || []) {
    const day = row?._id?.day;
    // Las llaves YYYY-MM-DD se comparan bien como texto.
    const bucket = buckets.find((week) => day >= week.weekStart && day <= week.weekEnd);
    if (!bucket) continue;
    const count = Number(row.count) || 0;
    bucket.allOrders += count;
    if (row._id.kiosk === true) {
      bucket.orders += count;
      bucket.paidOrders += Number(row.paidCount) || 0;
      bucket.revenue += Number(row.revenue) || 0;
    }
  }

  return buckets.map((week) => ({ ...week, revenue: round2(week.revenue) }));
}
