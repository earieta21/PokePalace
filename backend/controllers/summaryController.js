import Order from "../models/Order.js";
import Expense from "../models/Expense.js";
import Inventory from "../models/Inventory.js";
import WasteLog from "../models/WasteLog.js";
import ErrorLog from "../models/ErrorLog.js";
import User from "../models/User.js";
import {
  dateKeyInTimeZone,
  zonedDateTimeToUtc,
  zonedParts,
  RESTAURANT_TIME_ZONE,
} from "../utils/timeZone.js";

/* Las fechas se guardan en UTC y se agrupan con America/Tijuana para respetar
   tanto el día local como los cambios estacionales de huso horario. */
const toTijuana = (date) => {
  const parts = zonedParts(date);
  return new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  ));
};
const fromTijuana = (date) => zonedDateTimeToUtc({
  year: date.getUTCFullYear(),
  month: date.getUTCMonth() + 1,
  day: date.getUTCDate(),
  hour: date.getUTCHours(),
  minute: date.getUTCMinutes(),
  second: date.getUTCSeconds(),
});

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Lunes 00:00 (hora Tijuana) de la semana que contiene `date`, como instante UTC.
function mondayOf(date) {
  const tj = toTijuana(date);
  const monday = new Date(Date.UTC(tj.getUTCFullYear(), tj.getUTCMonth(), tj.getUTCDate()));
  const day = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (day === 0 ? 6 : day - 1));
  return fromTijuana(monday);
}

const dateStr = (d) => dateKeyInTimeZone(d);

// Interpreta ?weekStart=YYYY-MM-DD (cualquier día de la semana deseada) y lo
// ancla al lunes de esa semana. Ignora valores inválidos o futuros — nunca
// deja ver "la próxima semana" antes de que exista.
function resolveWeekFrom(weekStartParam, currentWeekFrom) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(weekStartParam || ""));
  if (!match) return currentWeekFrom;
  const [, year, month, day] = match;
  const instant = zonedDateTimeToUtc({ year: Number(year), month: Number(month), day: Number(day) });
  const requested = mondayOf(instant);
  return requested <= currentWeekFrom ? requested : currentWeekFrom;
}

function salesMetrics(orders) {
  const valid = orders.filter((o) => o.status !== "cancelled");
  const paid  = valid.filter((o) => o.paymentStatus === "paid" && o.total != null);
  const revenue = paid.reduce((s, o) => s + o.total, 0);
  return {
    revenue:   parseFloat(revenue.toFixed(2)),
    orders:    valid.length,
    avgTicket: paid.length > 0 ? parseFloat((revenue / paid.length).toFixed(2)) : 0,
  };
}

/* GET /api/staff/summary — resumen de una semana vs la anterior.
   ?weekStart=YYYY-MM-DD navega a semanas pasadas; sin parámetro (o uno
   futuro) muestra la semana actual. */
export const getWeeklySummary = async (req, res) => {
  try {
    const now             = new Date();
    const currentWeekFrom = mondayOf(now);
    const weekFrom         = resolveWeekFrom(req.query.weekStart, currentWeekFrom);
    const isCurrentWeek    = weekFrom.getTime() === currentWeekFrom.getTime();
    const weekTo           = new Date(weekFrom.getTime() + 7 * 86400000); // límite exclusivo
    const prevFrom         = mondayOf(new Date(weekFrom.getTime() - 86400000));
    const weekToStr        = dateStr(weekTo);

    // Punto hasta donde "esta semana" cuenta: ahora mismo si es la semana en
    // curso (para no comparar 2 días contra los 7 completos de la anterior),
    // o el domingo de esa semana si ya se cerró por completo. prevCutoff es
    // ese mismo punto, una semana antes -- así "vs semana pasada" siempre
    // compara periodos del mismo tamaño (p.ej. martes vs martes, no martes
    // vs la semana completa).
    const cutoff     = isCurrentWeek ? now : weekTo;
    const prevCutoff = new Date(cutoff.getTime() - 7 * 86400000);

    const [orders, expenses, inventory, waste, errorLogs, registeredCustomers] = await Promise.all([
      Order.find({ createdAt: { $gte: prevFrom, $lt: weekTo } }).lean(),
      Expense.find({ date: { $gte: dateStr(prevFrom), $lt: weekToStr } }).lean(),
      Inventory.find().lean(),
      WasteLog.find({ createdAt: { $gte: prevFrom, $lt: weekTo } }).lean(),
      ErrorLog.find({ lastSeenAt: { $gte: weekFrom, $lt: weekTo } }).lean(),
      // Cuentas creadas hasta el final de la semana consultada, para que el
      // historial de semanas pasadas no muestre el total de HOY.
      User.countDocuments({ role: "user", createdAt: { $lt: weekTo } }),
    ]);

    const thisOrders = orders.filter((o) => o.createdAt >= weekFrom && o.createdAt < weekTo);
    // Semana pasada completa (lunes a domingo) -- se usa solo para "clientes
    // que regresaron", un cruce de identidad entre semanas que no debe
    // acortarse igual que las cifras de venta.
    const prevOrdersFull = orders.filter((o) => o.createdAt < weekFrom);
    // Semana pasada hasta el mismo punto que ya llevamos esta semana --
    // la comparación real para los KPIs.
    const prevOrdersToDate = orders.filter((o) => o.createdAt >= prevFrom && o.createdAt < prevCutoff);

    const sales     = salesMetrics(thisOrders);
    const prevSales = salesMetrics(prevOrdersToDate);

    // Desglose por día y hora pico (solo semana actual, hora local Tijuana)
    const byDay = DAY_LABELS.map((day) => ({ day, revenue: 0, orders: 0 }));
    const byHour = new Array(24).fill(0);
    for (const o of thisOrders) {
      if (o.status === "cancelled") continue;
      const tj = toTijuana(new Date(o.createdAt));
      const idx = (tj.getUTCDay() + 6) % 7; // 0 = lunes
      byDay[idx].orders += 1;
      if (o.paymentStatus === "paid" && o.total != null) byDay[idx].revenue += o.total;
      byHour[tj.getUTCHours()] += 1;
    }
    byDay.forEach((d) => { d.revenue = parseFloat(d.revenue.toFixed(2)); });
    const bestDay  = byDay.reduce((best, d) => (d.revenue > best.revenue ? d : best), byDay[0]);
    const peakIdx  = byHour.indexOf(Math.max(...byHour));
    const peakHour = byHour[peakIdx] > 0 ? peakIdx : null;

    // Proteína y artículo POS más pedidos de la semana
    const proteinCounts = {};
    const itemCounts = {};
    for (const o of thisOrders) {
      if (o.status === "cancelled") continue;
      const prots = [...(o.proteins || []), ...(o.protein ? [o.protein] : [])];
      prots.forEach((p) => { proteinCounts[p] = (proteinCounts[p] || 0) + 1; });
      (o.items || []).forEach((it) => {
        if (it?.name) itemCounts[it.name] = (itemCounts[it.name] || 0) + (it.qty || 1);
      });
    }
    const top = (counts) => {
      const entries = Object.entries(counts).sort(([, a], [, b]) => b - a);
      return entries.length > 0 ? { name: entries[0][0], count: entries[0][1] } : null;
    };

    // Clientes que regresaron: identidad = usuario o teléfono, con orden previa a esta semana
    const idOf = (o) => (o.user ? String(o.user) : o.phone || null);
    const before = new Set(prevOrdersFull.map(idOf).filter(Boolean));
    const returning = new Set(
      thisOrders.map(idOf).filter((id) => id && before.has(id))
    ).size;

    // Gastos y ganancia. Expense.date es un date-key (día completo, no
    // instante), así que el corte de "hasta el mismo punto" se expresa como
    // el último día a incluir, inclusive -- por eso la resta de un día extra
    // cuando prevCutoff cae justo en la medianoche del lunes de esta semana
    // (semana pasada ya cerrada: se quiere el domingo completo, no el lunes).
    const weekFromStr    = dateStr(weekFrom);
    const prevFromStr    = dateStr(prevFrom);
    const prevCutoffStr  = isCurrentWeek
      ? dateStr(prevCutoff)
      : dateStr(new Date(prevCutoff.getTime() - 86400000));
    const expThis = expenses.filter((e) => e.date >= weekFromStr).reduce((s, e) => s + e.amount, 0);
    const expPrev = expenses
      .filter((e) => e.date >= prevFromStr && e.date <= prevCutoffStr)
      .reduce((s, e) => s + e.amount, 0);

    // Inventario y merma
    const lowCount   = inventory.filter((i) => i.qty <= (i.minQty ?? 0)).length;
    const totalValue = inventory.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.cost) || 0), 0);
    const wasteThis  = waste.filter((w) => w.createdAt >= weekFrom);
    const wastePrev  = waste.filter((w) => w.createdAt >= prevFrom && w.createdAt < prevCutoff);
    const wasteCost  = (list) => parseFloat(list.reduce((s, w) => s + (w.cost || 0), 0).toFixed(2));

    // La semana en curso aún no termina — su "hasta" es hoy, no el domingo.
    const rangeTo = isCurrentWeek ? now : new Date(weekTo.getTime() - 86400000);

    res.json({
      weekStart: weekFromStr,
      isCurrentWeek,
      range: { from: weekFromStr, to: dateStr(rangeTo), prevFrom: dateStr(prevFrom) },
      sales: { ...sales, prev: prevSales },
      money: {
        expenses: parseFloat(expThis.toFixed(2)),
        net:      parseFloat((sales.revenue - expThis).toFixed(2)),
        prev: {
          expenses: parseFloat(expPrev.toFixed(2)),
          net:      parseFloat((prevSales.revenue - expPrev).toFixed(2)),
        },
      },
      byDay,
      bestDay: bestDay.revenue > 0 ? bestDay : null,
      peakHour,
      topProtein: top(proteinCounts),
      topPosItem: top(itemCounts),
      returningCustomers: returning,
      registeredCustomers,
      inventory: { lowCount, totalValue: parseFloat(totalValue.toFixed(2)) },
      waste: {
        count: wasteThis.length,
        cost:  wasteCost(wasteThis),
        prev:  { count: wastePrev.length, cost: wasteCost(wastePrev) },
      },
      techErrors: errorLogs.reduce((s, e) => s + (e.count || 1), 0),
    });
  } catch (err) {
    res.status(500).json({ message: "Error al generar el resumen", err: err.message });
  }
};

/* GET /api/staff/summary/weeks — historial de semanas con ventas/órdenes,
   agrupable por mes en el frontend. Más reciente primero. */
export const getSummaryWeeks = async (req, res) => {
  try {
    const orders = await Order.find({ status: { $ne: "cancelled" } })
      .select("createdAt paymentStatus total")
      .lean();

    const byWeek = new Map(); // lunes (epoch ms) -> { weekFrom, orders, revenue }
    for (const o of orders) {
      const weekFrom = mondayOf(new Date(o.createdAt));
      const key = weekFrom.getTime();
      const bucket = byWeek.get(key) || { weekFrom, orders: 0, revenue: 0 };
      bucket.orders += 1;
      if (o.paymentStatus === "paid" && o.total != null) bucket.revenue += o.total;
      byWeek.set(key, bucket);
    }

    const dayMonthFmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: RESTAURANT_TIME_ZONE });
    const monthFmt = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: RESTAURANT_TIME_ZONE });
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    const weeks = [...byWeek.values()]
      .sort((a, b) => b.weekFrom - a.weekFrom)
      .slice(0, 26) // ~6 meses
      .map(({ weekFrom, orders: orderCount, revenue }) => {
        const weekTo = new Date(weekFrom.getTime() + 6 * 86400000);
        return {
          weekStart: dateStr(weekFrom),
          from: dateStr(weekFrom),
          to: dateStr(weekTo),
          label: `${dayMonthFmt.format(weekFrom)} – ${dayMonthFmt.format(weekTo)}`,
          month: capitalize(monthFmt.format(weekFrom)),
          orders: orderCount,
          revenue: parseFloat(revenue.toFixed(2)),
        };
      });

    res.json({ weeks });
  } catch (err) {
    res.status(500).json({ message: "Error al generar el historial semanal", err: err.message });
  }
};
