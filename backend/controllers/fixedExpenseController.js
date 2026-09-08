import mongoose from "mongoose";
import Expense, { EXPENSE_CATEGORIES } from "../models/Expense.js";
import FixedExpense from "../models/FixedExpense.js";
import { computeWeeklyPayroll } from "../utils/payroll.js";
import { dateKeyInTimeZone, startOfDateKey, zonedParts } from "../utils/timeZone.js";
import { mondayOf, weekEndKeyOf } from "../utils/weeks.js";
import { dueDayOf, periodKeyOf, registerDueFixedExpenses } from "../utils/fixedExpenses.js";

const PAYROLL_WEEKS_BACK = 8;

const cleanPayload = (body = {}) => {
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const amount = Number(body.amount);
  const dayOfMonth = Number(body.dayOfMonth);
  if (!name) return { error: "Ponle un nombre al gasto fijo" };
  if (!EXPENSE_CATEGORIES.includes(body.category)) return { error: "Categoría inválida" };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "El monto debe ser mayor a cero" };
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    return { error: "El día del mes debe estar entre 1 y 31" };
  }
  return { data: { name, category: body.category, amount, dayOfMonth } };
};

/* GET /api/staff/fixed-expenses — la lista con el estado del mes en curso. */
export const getFixedExpenses = async (req, res) => {
  try {
    const items = await FixedExpense.find().sort({ name: 1 }).lean();
    const { year, month } = zonedParts();
    const period = periodKeyOf(year, month);

    const refs = items.map((item) => `fixed:${item._id}:${period}`);
    const registered = await Expense.find({ sourceRef: { $in: refs } })
      .select("sourceRef amount date")
      .lean();
    const byRef = new Map(registered.map((expense) => [expense.sourceRef, expense]));

    res.json({
      period,
      items: items.map((item) => {
        const expense = byRef.get(`fixed:${item._id}:${period}`);
        return {
          ...item,
          dueDay: dueDayOf(item, year, month),
          registeredThisPeriod: Boolean(expense),
          registeredAmount: expense?.amount ?? null,
          registeredDate: expense?.date ?? null,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ message: "Error al obtener gastos fijos", err: err.message });
  }
};

/* POST /api/staff/fixed-expenses — si el día del mes ya pasó, lo anota de una
   vez para que el mes en curso no quede sin registrar. */
export const createFixedExpense = async (req, res) => {
  try {
    const { data, error } = cleanPayload(req.body);
    if (error) return res.status(400).json({ message: error });

    const item = await FixedExpense.create({
      ...data,
      locationId: req.staff?.locationId || "tij-centro-01",
      createdBy: req.staff?.name || req.staff?.email || "staff",
    });

    const created = await registerDueFixedExpenses();
    res.status(201).json({
      item,
      registeredNow: created.some((expense) => expense.sourceRef.startsWith(`fixed:${item._id}:`)),
    });
  } catch (err) {
    res.status(400).json({ message: "Error al crear el gasto fijo", err: err.message });
  }
};

/* PATCH /api/staff/fixed-expenses/:id */
export const updateFixedExpense = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Gasto fijo inválido" });
    }
    // `active` puede venir solo, sin el resto de los campos.
    if (Object.keys(req.body).length === 1 && typeof req.body.active === "boolean") {
      const item = await FixedExpense.findByIdAndUpdate(
        req.params.id,
        { $set: { active: req.body.active } },
        { new: true, runValidators: true }
      );
      if (!item) return res.status(404).json({ message: "Gasto fijo no encontrado" });
      return res.json({ item });
    }

    const { data, error } = cleanPayload(req.body);
    if (error) return res.status(400).json({ message: error });

    const item = await FixedExpense.findByIdAndUpdate(
      req.params.id,
      { $set: { ...data, ...(typeof req.body.active === "boolean" ? { active: req.body.active } : {}) } },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ message: "Gasto fijo no encontrado" });
    res.json({ item });
  } catch (err) {
    res.status(400).json({ message: "Error al actualizar el gasto fijo", err: err.message });
  }
};

/* DELETE /api/staff/fixed-expenses/:id — deja de anotarse a futuro; los gastos
   que ya se registraron en Finanzas no se tocan. */
export const deleteFixedExpense = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Gasto fijo inválido" });
    }
    await FixedExpense.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Error al eliminar el gasto fijo", err: err.message });
  }
};

/* GET /api/staff/payroll/weeks — semanas ya cerradas, con su nómina calculada
   y si ya se registró en Finanzas. La semana en curso no aparece: todavía
   faltan turnos por checar. */
export const getPayrollWeeks = async (req, res) => {
  try {
    const currentMonday = mondayOf(new Date());
    const weeks = [];
    for (let i = 1; i <= PAYROLL_WEEKS_BACK; i += 1) {
      weeks.push(new Date(currentMonday.getTime() - i * 7 * 86400000));
    }

    const payrolls = await Promise.all(
      weeks.map((weekFrom) => computeWeeklyPayroll(weekFrom, { locationId: req.staff?.locationId }))
    );

    const refs = payrolls.map((payroll) => `payroll:${payroll.weekStart}`);
    const registered = await Expense.find({ sourceRef: { $in: refs } })
      .select("sourceRef amount date")
      .lean();
    const byRef = new Map(registered.map((expense) => [expense.sourceRef, expense]));

    res.json({
      weeks: payrolls.map((payroll) => {
        const expense = byRef.get(`payroll:${payroll.weekStart}`);
        return {
          ...payroll,
          registered: Boolean(expense),
          registeredAmount: expense?.amount ?? null,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ message: "Error al calcular la nómina", err: err.message });
  }
};

/* POST /api/staff/payroll/register — body: { weekStart, amount }
   El monto es editable a propósito (una checada olvidada deja el cálculo
   corto), pero la semana se ancla al lunes real y `sourceRef` impide que la
   misma semana se registre dos veces. */
export const registerPayrollExpense = async (req, res) => {
  try {
    const weekStartInput = startOfDateKey(req.body.weekStart);
    if (!weekStartInput) return res.status(400).json({ message: "Semana inválida" });

    const weekFrom = mondayOf(weekStartInput);
    const currentMonday = mondayOf(new Date());
    if (weekFrom.getTime() >= currentMonday.getTime()) {
      return res.status(400).json({ message: "Esa semana todavía no cierra" });
    }

    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "El monto debe ser mayor a cero" });
    }

    const weekStart = dateKeyInTimeZone(weekFrom);
    const weekEnd = weekEndKeyOf(weekFrom);

    const expense = await Expense.create({
      category: "Nómina",
      description: `Nómina semana ${weekStart} al ${weekEnd}`,
      amount,
      date: weekEnd,
      locationId: req.staff?.locationId || "tij-centro-01",
      createdBy: req.staff?.name || req.staff?.email || "staff",
      source: "nomina",
      sourceRef: `payroll:${weekStart}`,
    });

    res.status(201).json({ expense });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Esa semana ya estaba registrada en Finanzas" });
    }
    res.status(400).json({ message: "Error al registrar la nómina", err: err.message });
  }
};
