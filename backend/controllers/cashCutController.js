import CashCut from "../models/CashCut.js";
import Order from "../models/Order.js";
import { dayRangeInTimeZone, dateKeyInTimeZone, startOfDateKey, nextDateKey } from "../utils/timeZone.js";
import { recordAudit, actorFromStaff } from "../utils/auditLog.js";
import { computeCashCutTotals, requiresDifferenceExplanation } from "../utils/cashCutMath.js";

const round2 = (n) => Math.round(n * 100) / 100;

/* Ventas esperadas por método de pago -- siempre de órdenes pagadas y no
   canceladas del periodo, nunca del monto que el cliente pudo capturar. */
async function sumSalesByMethod(from, to) {
  const orders = await Order.find({
    paymentStatus: "paid",
    status: { $ne: "cancelled" },
    total: { $ne: null },
    createdAt: { $gte: from, $lt: to },
  }).select("total paymentMethod");

  const sums = { cash: 0, card_terminal: 0, online: 0, pay_at_pickup: 0 };
  for (const o of orders) {
    const key = sums[o.paymentMethod] !== undefined ? o.paymentMethod : "pay_at_pickup";
    sums[key] += o.total ?? 0;
  }
  return sums;
}

const numOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined; // undefined = inválido
};

/* GET /api/staff/cash-cuts/today -- ¿ya existe un cierre para hoy? incluye
   una vista previa de ventas del sistema en lo que va del día, exista o no
   un cierre abierto todavía. */
export const getTodayCashCut = async (req, res) => {
  try {
    const locationId = req.staff?.locationId || "tij-centro-01";
    const date = dateKeyInTimeZone();
    const { start } = dayRangeInTimeZone();

    const [cashCut, salesSoFar] = await Promise.all([
      CashCut.findOne({ locationId, date }),
      sumSalesByMethod(start, new Date()),
    ]);

    res.json({
      cashCut,
      date,
      salesSoFar: {
        cash: round2(salesSoFar.cash),
        card: round2(salesSoFar.card_terminal),
        online: round2(salesSoFar.online),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Error al consultar el cierre de hoy", err: err.message });
  }
};

/* POST /api/staff/cash-cuts  { openingFloat, date? } -- abre el cierre del
   día. Un solo documento por sucursal+fecha (índice único parcial); si ya
   existe uno (abierto o cerrado) se rechaza -- corregir uno cerrado requiere
   reabrirlo explícitamente, no crear uno nuevo por encima. */
export const openCashCut = async (req, res) => {
  try {
    const numOpening = numOrNull(req.body.openingFloat);
    if (numOpening === undefined || numOpening === null || numOpening < 0) {
      return res.status(400).json({ message: "El fondo inicial debe ser un número mayor o igual a cero" });
    }

    const locationId = req.staff?.locationId || "tij-centro-01";
    const date = typeof req.body.date === "string" && req.body.date ? req.body.date : dateKeyInTimeZone();
    const dayStart = startOfDateKey(date);
    if (!dayStart) return res.status(400).json({ message: "Fecha inválida" });

    const existing = await CashCut.findOne({ locationId, date });
    if (existing) {
      return res.status(409).json({
        message: existing.status === "open"
          ? "Ya hay un cierre abierto para hoy"
          : "El cierre de hoy ya existe y está cerrado -- reábrelo para corregirlo",
        cashCut: existing,
      });
    }

    const cashCut = await CashCut.create({
      employeeId: req.staff.id,
      employeeName: req.staff.name || "Staff",
      locationId, date, status: "open",
      from: dayStart,
      openingFloat: numOpening,
    });

    await recordAudit({
      entity: "CashCut", entityId: cashCut._id, action: "create",
      changes: [{ field: "status", oldValue: null, newValue: "open" }],
      ...actorFromStaff(req.staff), source: "manual", reason: "Apertura de cierre diario",
    });

    res.status(201).json({ cashCut });
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await CashCut.findOne({
        locationId: req.staff?.locationId || "tij-centro-01",
        date: req.body.date || dateKeyInTimeZone(),
      });
      return res.status(409).json({ message: "Ya existe un cierre para hoy", cashCut: existing });
    }
    res.status(400).json({ message: "Error al abrir el cierre", err: err.message });
  }
};

/* PATCH /api/staff/cash-cuts/:id -- captura datos mientras el cierre sigue
   abierto (retiros, devoluciones, comisiones, terminal, en línea, notas). */
export const updateCashCut = async (req, res) => {
  try {
    const before = await CashCut.findById(req.params.id);
    if (!before) return res.status(404).json({ message: "Cierre no encontrado" });
    if (before.status !== "open") {
      return res.status(409).json({ message: "Solo se puede editar un cierre abierto" });
    }

    const EDITABLE = ["openingFloat", "withdrawals", "returns", "commissions", "cardTerminalTotal", "onlineTotalReported", "notes"];
    const updates = {};
    for (const field of EDITABLE) {
      if (!Object.prototype.hasOwnProperty.call(req.body, field)) continue;
      if (field === "notes") { updates.notes = String(req.body.notes || "").trim().slice(0, 500); continue; }
      const n = numOrNull(req.body[field]);
      if (n === undefined) return res.status(400).json({ message: `${field} no es un número válido` });
      if (n !== null && n < 0) return res.status(400).json({ message: `${field} no puede ser negativo` });
      updates[field] = n;
    }

    Object.assign(before, updates);
    await before.save();
    res.json({ cashCut: before });
  } catch (err) {
    res.status(400).json({ message: "Error al actualizar el cierre", err: err.message });
  }
};

/* PATCH /api/staff/cash-cuts/:id/close  { countedCash, differenceExplanation? } */
export const closeCashCut = async (req, res) => {
  try {
    const cashCut = await CashCut.findById(req.params.id);
    if (!cashCut) return res.status(404).json({ message: "Cierre no encontrado" });
    if (cashCut.status !== "open") {
      return res.status(409).json({ message: "Este cierre ya está cerrado" });
    }

    const numCounted = numOrNull(req.body.countedCash);
    if (numCounted === undefined || numCounted === null || numCounted < 0) {
      return res.status(400).json({ message: "El efectivo contado debe ser un número mayor o igual a cero" });
    }

    const to = new Date();
    const sales = await sumSalesByMethod(cashCut.from, to);
    const cashSales = round2(sales.cash);
    const cardSalesExpected = round2(sales.card_terminal);
    const onlineSalesExpected = round2(sales.online);

    const { expectedCash, difference, percentDifference } = computeCashCutTotals({
      openingFloat: cashCut.openingFloat, cashSales,
      returns: cashCut.returns, withdrawals: cashCut.withdrawals,
      countedCash: numCounted,
    });

    const explanation = String(req.body.differenceExplanation || "").trim();
    if (requiresDifferenceExplanation(percentDifference) && !explanation) {
      return res.status(400).json({
        message: `La diferencia de efectivo (${percentDifference.toFixed(2)}%) supera el 1% -- explica el motivo antes de cerrar.`,
        requiresExplanation: true,
        percentDifference,
      });
    }

    const cardDifference = cashCut.cardTerminalTotal != null
      ? round2(cashCut.cardTerminalTotal - cardSalesExpected)
      : null;
    const onlineDifference = cashCut.onlineTotalReported != null
      ? round2(cashCut.onlineTotalReported - onlineSalesExpected)
      : null;

    cashCut.to = to;
    cashCut.status = "closed";
    cashCut.cashSales = cashSales;
    cashCut.cardSalesExpected = cardSalesExpected;
    cashCut.onlineSalesExpected = onlineSalesExpected;
    cashCut.expectedCash = expectedCash;
    cashCut.countedCash = numCounted;
    cashCut.difference = difference;
    cashCut.percentDifference = percentDifference;
    cashCut.differenceExplanation = explanation;
    cashCut.cardDifference = cardDifference;
    cashCut.onlineDifference = onlineDifference;
    await cashCut.save();

    await recordAudit({
      entity: "CashCut", entityId: cashCut._id, action: "update",
      changes: [
        { field: "status", oldValue: "open", newValue: "closed" },
        { field: "difference", oldValue: null, newValue: difference },
      ],
      ...actorFromStaff(req.staff), source: "manual",
      reason: explanation || "Cierre de caja",
    });

    res.json({ cashCut });
  } catch (err) {
    res.status(400).json({ message: "Error al cerrar el cierre", err: err.message });
  }
};

/* PATCH /api/staff/cash-cuts/:id/reopen  { reason } -- solo owner/admin. */
export const reopenCashCut = async (req, res) => {
  try {
    const reason = String(req.body.reason || "").trim();
    if (!reason) return res.status(400).json({ message: "Escribe el motivo de la reapertura" });

    const cashCut = await CashCut.findById(req.params.id);
    if (!cashCut) return res.status(404).json({ message: "Cierre no encontrado" });
    if (cashCut.status !== "closed") {
      return res.status(409).json({ message: "Solo se puede reabrir un cierre cerrado" });
    }

    const previousStatus = cashCut.status;
    cashCut.status = "open";
    cashCut.reopenedAt = new Date();
    cashCut.reopenReason = reason;
    cashCut.reopenedBy = req.staff?.name || req.staff?.email || "Staff";
    await cashCut.save();

    await recordAudit({
      entity: "CashCut", entityId: cashCut._id, action: "update",
      changes: [{ field: "status", oldValue: previousStatus, newValue: "open" }],
      ...actorFromStaff(req.staff), source: "manual", reason,
    });

    res.json({ cashCut });
  } catch (err) {
    res.status(400).json({ message: "Error al reabrir el cierre", err: err.message });
  }
};

/* GET /api/staff/cash-cuts?from=YYYY-MM-DD&to=YYYY-MM-DD -- historial;
   incluye tanto cierres diarios nuevos como cortes de turno anteriores a
   esta función (sin romper lo ya guardado). */
export const getCashCuts = async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = startOfDateKey(from);
      if (to)   filter.createdAt.$lt  = startOfDateKey(nextDateKey(to));
    }
    const cashCuts = await CashCut.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json({ cashCuts });
  } catch (err) {
    res.status(500).json({ message: "Error al obtener cortes", err: err.message });
  }
};