import Order from "../models/Order.js";
import Expense from "../models/Expense.js";
import Inventory from "../models/Inventory.js";
import WasteLog from "../models/WasteLog.js";
import ErrorLog from "../models/ErrorLog.js";

/* El negocio opera en Tijuana (UTC-7). Las fechas se guardan en UTC, así que
   desplazamos antes de agrupar por día/hora para que "el martes" sea el
   martes real del local y no el de Greenwich. */
const TJ_OFFSET_MS = 7 * 60 * 60 * 1000;
const toTijuana   = (date) => new Date(date.getTime() - TJ_OFFSET_MS);
const fromTijuana = (date) => new Date(date.getTime() + TJ_OFFSET_MS);

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Lunes 00:00 (hora Tijuana) de la semana que contiene `date`, como instante UTC.
function mondayOf(date) {
  const tj = toTijuana(date);
  const monday = new Date(Date.UTC(tj.getUTCFullYear(), tj.getUTCMonth(), tj.getUTCDate()));
  const day = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (day === 0 ? 6 : day - 1));
  return fromTijuana(monday);
}

const dateStr = (d) => toTijuana(d).toISOString().slice(0, 10);

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

/* GET /api/staff/summary — resumen de esta semana vs la anterior */
export const getWeeklySummary = async (req, res) => {
  try {
    const now      = new Date();
    const weekFrom = mondayOf(now);
    const prevFrom = new Date(weekFrom.getTime() - 7 * 86400000);

    const [orders, expenses, inventory, waste, errorLogs] = await Promise.all([
      Order.find({ createdAt: { $gte: prevFrom } }).lean(),
      Expense.find({ date: { $gte: dateStr(prevFrom) } }).lean(),
      Inventory.find().lean(),
      WasteLog.find({ createdAt: { $gte: prevFrom } }).lean(),
      ErrorLog.find({ lastSeenAt: { $gte: weekFrom } }).lean(),
    ]);

    const thisOrders = orders.filter((o) => o.createdAt >= weekFrom);
    const prevOrders = orders.filter((o) => o.createdAt < weekFrom);

    const sales     = salesMetrics(thisOrders);
    const prevSales = salesMetrics(prevOrders);

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
    const before = new Set(prevOrders.map(idOf).filter(Boolean));
    const returning = new Set(
      thisOrders.map(idOf).filter((id) => id && before.has(id))
    ).size;

    // Gastos y ganancia
    const weekFromStr = dateStr(weekFrom);
    const expThis = expenses.filter((e) => e.date >= weekFromStr).reduce((s, e) => s + e.amount, 0);
    const expPrev = expenses.filter((e) => e.date <  weekFromStr).reduce((s, e) => s + e.amount, 0);

    // Inventario y merma
    const lowCount   = inventory.filter((i) => i.qty <= (i.minQty ?? 0)).length;
    const totalValue = inventory.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.cost) || 0), 0);
    const wasteThis  = waste.filter((w) => w.createdAt >= weekFrom);
    const wastePrev  = waste.filter((w) => w.createdAt < weekFrom);
    const wasteCost  = (list) => parseFloat(list.reduce((s, w) => s + (w.cost || 0), 0).toFixed(2));

    res.json({
      range: { from: weekFromStr, to: dateStr(now), prevFrom: dateStr(prevFrom) },
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
