import CashCut from "../models/CashCut.js";
import Order from "../models/Order.js";
import { dayRangeInTimeZone, startOfDateKey, nextDateKey } from "../utils/timeZone.js";

const round2 = (n) => Math.round(n * 100) / 100;

async function sumCashSales(from, to) {
  const orders = await Order.find({
    paymentMethod: "cash",
    paymentStatus: "paid",
    status: { $ne: "cancelled" },
    total: { $ne: null },
    createdAt: { $gte: from, $lt: to },
  }).select("total");
  return orders.reduce((sum, o) => sum + (o.total ?? 0), 0);
}

// Encadena cada corte al anterior: el periodo nuevo empieza justo donde
// terminó el último, así ninguna venta en efectivo queda fuera o se cuenta
// dos veces. Si nunca se ha hecho un corte, arranca desde el inicio del día.
async function resolvePeriodStart(locationId) {
  const lastCut = await CashCut.findOne({ locationId }).sort({ to: -1 });
  if (lastCut) return { from: lastCut.to, suggestedOpeningFloat: lastCut.openingFloat, lastCutAt: lastCut.to };
  return { from: dayRangeInTimeZone().start, suggestedOpeningFloat: 0, lastCutAt: null };
}

/* GET /api/staff/cash-cuts/preview */
export const getCashCutPreview = async (req, res) => {
  try {
    const locationId = req.staff?.locationId || "tij-centro-01";
    const { from, suggestedOpeningFloat, lastCutAt } = await resolvePeriodStart(locationId);
    const to = new Date();
    const cashSales = round2(await sumCashSales(from, to));
    res.json({ from, to, cashSales, suggestedOpeningFloat, lastCutAt });
  } catch (err) {
    res.status(500).json({ message: "Error al calcular el corte", err: err.message });
  }
};

/* POST /api/staff/cash-cuts  { openingFloat, countedCash, notes } */
export const createCashCut = async (req, res) => {
  try {
    const { openingFloat, countedCash, notes } = req.body;
    const numOpening = Number(openingFloat);
    const numCounted = Number(countedCash);
    if (!Number.isFinite(numOpening) || numOpening < 0) {
      return res.status(400).json({ message: "El fondo inicial debe ser un número mayor o igual a cero" });
    }
    if (!Number.isFinite(numCounted) || numCounted < 0) {
      return res.status(400).json({ message: "El efectivo contado debe ser un número mayor o igual a cero" });
    }

    const locationId = req.staff?.locationId || "tij-centro-01";
    const { from } = await resolvePeriodStart(locationId);
    const to = new Date();
    const cashSales = round2(await sumCashSales(from, to));
    const expectedCash = round2(numOpening + cashSales);
    const difference = round2(numCounted - expectedCash);

    const cashCut = await CashCut.create({
      employeeId: req.staff.id,
      employeeName: req.staff.name || "Staff",
      from,
      to,
      openingFloat: numOpening,
      cashSales,
      expectedCash,
      countedCash: numCounted,
      difference,
      notes: String(notes || "").trim().slice(0, 300),
      locationId,
    });
    res.status(201).json({ cashCut });
  } catch (err) {
    res.status(400).json({ message: "Error al registrar el corte", err: err.message });
  }
};

/* GET /api/staff/cash-cuts?from=YYYY-MM-DD&to=YYYY-MM-DD */
export const getCashCuts = async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    if (from || to) {
      filter.to = {};
      if (from) filter.to.$gte = startOfDateKey(from);
      if (to)   filter.to.$lt  = startOfDateKey(nextDateKey(to));
    }
    const cashCuts = await CashCut.find(filter).sort({ to: -1 }).limit(200);
    res.json({ cashCuts });
  } catch (err) {
    res.status(500).json({ message: "Error al obtener cortes", err: err.message });
  }
};
