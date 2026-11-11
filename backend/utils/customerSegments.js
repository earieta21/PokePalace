import { GOLD_TIER_MIN_POINTS, POINTS_INACTIVITY_MONTHS } from "./loyalty.js";

/* Segmentos del directorio de clientes (pestaña Clientes del portal).
   Funciones puras sobre el usuario y sus estadísticas de compra para poder
   probarlas sin Mongo; el controlador solo junta los datos. */

export const NEW_CUSTOMER_DAYS = 30;
export const FREQUENT_WINDOW_DAYS = 60;
export const FREQUENT_MIN_PURCHASES = 3;
export const DORMANT_AFTER_DAYS = 30;
export const EXPIRY_WARNING_DAYS = 60;

export const CUSTOMER_SEGMENTS = ["all", "new", "frequent", "dormant", "never", "gold", "expiring"];
export const CUSTOMER_SORTS = ["recent", "spent", "purchases", "lastPurchase", "points", "expiry"];

export const SEGMENT_THRESHOLDS = {
  newDays: NEW_CUSTOMER_DAYS,
  frequentWindowDays: FREQUENT_WINDOW_DAYS,
  frequentMinPurchases: FREQUENT_MIN_PURCHASES,
  dormantDays: DORMANT_AFTER_DAYS,
  goldMinPoints: GOLD_TIER_MIN_POINTS,
  expiryWarningDays: EXPIRY_WARNING_DAYS,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const time = (value) => (value ? new Date(value).getTime() : null);

/* Fecha en que se borra el saldo si el cliente no vuelve a ganar puntos —
   misma regla que expireStalePoints (loyalty.js): 12 meses sin ganar.
   null si no tiene saldo o nunca ha ganado puntos (esos no vencen). */
export function pointsExpiryDate(customer) {
  if (!(customer?.points > 0) || !customer.pointsLastEarnedAt) return null;
  const expiresAt = new Date(customer.pointsLastEarnedAt);
  expiresAt.setMonth(expiresAt.getMonth() + POINTS_INACTIVITY_MONTHS);
  return expiresAt;
}

/* A qué segmentos pertenece un cliente. `stats` viene de los pedidos pagados
   y no cancelados: { purchaseCount, lastPurchaseAt, recentPurchaseCount }
   (recentPurchaseCount = compras dentro de FREQUENT_WINDOW_DAYS). */
export function customerFlags(customer, stats, now = new Date()) {
  const nowMs = now.getTime();
  const purchaseCount = stats?.purchaseCount || 0;
  const lastPurchase = time(stats?.lastPurchaseAt);
  const registered = time(customer?.createdAt);
  const expiresAt = pointsExpiryDate(customer);

  return {
    new: registered !== null && nowMs - registered <= NEW_CUSTOMER_DAYS * DAY_MS,
    frequent: (stats?.recentPurchaseCount || 0) >= FREQUENT_MIN_PURCHASES,
    dormant: purchaseCount > 0 && lastPurchase !== null && nowMs - lastPurchase > DORMANT_AFTER_DAYS * DAY_MS,
    never: purchaseCount === 0,
    gold: (customer?.lifetimePoints || 0) >= GOLD_TIER_MIN_POINTS,
    expiring: expiresAt !== null && expiresAt.getTime() - nowMs <= EXPIRY_WARNING_DAYS * DAY_MS,
  };
}

// Fechas vacías siempre al final, en cualquier dirección.
const byDate = (direction) => (a, b) => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "asc" ? a - b : b - a;
};
const dateDesc = byDate("desc");
const dateAsc = byDate("asc");

const SORTERS = {
  recent: (a, b) => dateDesc(time(a.createdAt), time(b.createdAt)),
  spent: (a, b) => b.totalSpent - a.totalSpent || dateDesc(time(a.lastPurchaseAt), time(b.lastPurchaseAt)),
  purchases: (a, b) => b.purchaseCount - a.purchaseCount || b.totalSpent - a.totalSpent,
  lastPurchase: (a, b) => dateDesc(time(a.lastPurchaseAt), time(b.lastPurchaseAt)),
  points: (a, b) => (b.points || 0) - (a.points || 0),
  expiry: (a, b) => dateAsc(time(a.pointsExpireAt), time(b.pointsExpireAt)),
};

/* Arma el directorio: cuenta cuántos clientes caen en cada segmento (para los
   botones de filtro), deja solo los del segmento pedido y los ordena. */
export function buildCustomerDirectory(customers, statsByCustomer, { segment = "all", sort = "recent", now = new Date() } = {}) {
  const activeSegment = CUSTOMER_SEGMENTS.includes(segment) ? segment : "all";
  const sorter = SORTERS[sort] || SORTERS.recent;
  const counts = Object.fromEntries(CUSTOMER_SEGMENTS.map((id) => [id, 0]));
  const rows = [];

  for (const customer of customers) {
    const stats = statsByCustomer.get(String(customer._id));
    const flags = customerFlags(customer, stats, now);
    const tags = Object.keys(flags).filter((key) => flags[key]);

    counts.all += 1;
    tags.forEach((tag) => { counts[tag] += 1; });
    if (activeSegment !== "all" && !flags[activeSegment]) continue;

    rows.push({
      ...customer,
      purchaseCount: stats?.purchaseCount || 0,
      totalSpent: stats?.totalSpent || 0,
      lastPurchaseAt: stats?.lastPurchaseAt || null,
      pointsExpireAt: pointsExpiryDate(customer),
      tags,
    });
  }

  rows.sort((a, b) => sorter(a, b) || dateDesc(time(a.createdAt), time(b.createdAt)) || String(b._id).localeCompare(String(a._id)));
  return { counts, rows };
}

/* Qué pide más el cliente, a partir de sus pedidos pagados. Los pedidos con
   carrito (cliente/kiosco) se leen de cartItems — sus campos planos repiten
   el primer bowl y se contaría dos veces; los del POS traen el bowl armado en
   los campos planos y el resto en `items`. */
export function summarizeCustomerOrders(orders) {
  const proteins = new Map();
  const items = new Map();
  const bySource = {};
  const add = (map, key, amount = 1) => {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + amount);
  };
  const qtyOf = (line) => Math.max(1, Number(line?.qty) || 1);

  for (const order of orders || []) {
    const source = order.source || "online";
    bySource[source] = (bySource[source] || 0) + 1;

    if (order.cartItems?.length) {
      for (const line of order.cartItems) {
        const qty = qtyOf(line);
        if (line.kind === "item") {
          add(items, line.name, qty);
        } else if (line.kind === "promo2x1") {
          add(items, "Promo 2x1 en Bowls", qty);
          add(proteins, line.protein, qty);
        } else {
          add(items, "Bowl personalizado", qty);
          (line.proteins || []).forEach((protein) => add(proteins, protein, qty));
        }
      }
      continue;
    }

    for (const item of order.items || []) {
      const qty = qtyOf(item);
      add(items, item.name, qty);
      const itemProteins = item.proteins?.length ? item.proteins : item.protein ? [item.protein] : [];
      itemProteins.forEach((protein) => add(proteins, protein, qty));
    }
    if (order.base || order.proteins?.length) {
      add(items, "Bowl personalizado");
      (order.proteins || []).forEach((protein) => add(proteins, protein));
    }
  }

  const top = (map, limit) => [...map]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));

  return { topProteins: top(proteins, 3), topItems: top(items, 4), bySource };
}

export const SALES_WINDOW_DAYS = 30;

const round2 = (value) => Math.round(value * 100) / 100;

/* Indicadores de la base de clientes (tarjetas arriba de la tabla).
   `purchaseRows` trae una fila por cuenta (o `_id: null` para las ventas sin
   cuenta) con `purchaseCount` (compras pagadas de siempre) y
   `windowOrders`/`windowRevenue` (ventas directas de los últimos
   SALES_WINDOW_DAYS; el controlador ya deja fuera las apps de delivery).
   Lo vendido a cuentas que ya no existen o que no son de cliente cuenta como
   "sin cuenta". */
export function summarizeCustomerBase(customers, purchaseRows, { monthStart, previousMonthStart }) {
  const customerIds = new Set(customers.map((customer) => String(customer._id)));
  const monthMs = time(monthStart);
  const previousMonthMs = time(previousMonthStart);

  let newThisMonth = 0;
  let newLastMonth = 0;
  for (const customer of customers) {
    const created = time(customer.createdAt);
    if (created === null) continue;
    if (created >= monthMs) newThisMonth += 1;
    else if (created >= previousMonthMs) newLastMonth += 1;
  }

  let buyers = 0;
  let repeatBuyers = 0;
  const member = { orders: 0, revenue: 0 };
  const guest = { orders: 0, revenue: 0 };
  for (const row of purchaseRows || []) {
    const isMember = row._id != null && customerIds.has(String(row._id));
    if (isMember && row.purchaseCount >= 1) buyers += 1;
    if (isMember && row.purchaseCount >= 2) repeatBuyers += 1;
    const bucket = isMember ? member : guest;
    bucket.orders += row.windowOrders || 0;
    bucket.revenue += row.windowRevenue || 0;
  }

  const withTicket = ({ orders, revenue }) => ({
    orders,
    revenue: round2(revenue),
    avgTicket: orders > 0 ? round2(revenue / orders) : null,
  });
  const totalRevenue = member.revenue + guest.revenue;

  return {
    accounts: { total: customers.length, newThisMonth, newLastMonth },
    buyers,
    repeatBuyers,
    sales: {
      windowDays: SALES_WINDOW_DAYS,
      member: withTicket(member),
      guest: withTicket(guest),
      memberShare: totalRevenue > 0 ? member.revenue / totalRevenue : null,
    },
  };
}

// El código del premio lo ve el cliente en su cuenta; al personal le basta
// con reconocerlo.
export const maskRewardCode = (code) => (code ? `••••${String(code).slice(-4)}` : null);
