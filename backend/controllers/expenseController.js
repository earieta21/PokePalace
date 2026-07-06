import Expense from "../models/Expense.js";
import Order   from "../models/Order.js";

/* GET /api/staff/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD */
export const getExpenses = async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to)   filter.date.$lte = to;
    }
    const expenses = await Expense.find(filter).sort({ date: -1, createdAt: -1 });
    res.json({ expenses });
  } catch (err) {
    res.status(500).json({ message: "Error al obtener gastos", err: err.message });
  }
};

/* GET /api/staff/expenses/summary?from=YYYY-MM-DD&to=YYYY-MM-DD */
export const getFinanceSummary = async (req, res) => {
  try {
    const { from, to } = req.query;

    // Revenue = paid orders in the period
    const orderFilter = { paymentStatus: "paid", total: { $ne: null } };
    if (from || to) {
      orderFilter.createdAt = {};
      if (from) orderFilter.createdAt.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) {
        const toDate = new Date(`${to}T23:59:59.999Z`);
        orderFilter.createdAt.$lte = toDate;
      }
    }
    const orders = await Order.find(orderFilter);
    const revenue = orders.reduce((s, o) => s + (o.total ?? 0), 0);

    // Expenses in the period
    const expFilter = {};
    if (from || to) {
      expFilter.date = {};
      if (from) expFilter.date.$gte = from;
      if (to)   expFilter.date.$lte = to;
    }
    const expenses = await Expense.find(expFilter);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

    // Breakdown by category
    const byCategory = {};
    expenses.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });

    res.json({
      revenue:    parseFloat(revenue.toFixed(2)),
      expenses:   parseFloat(totalExpenses.toFixed(2)),
      profit:     parseFloat((revenue - totalExpenses).toFixed(2)),
      orderCount: orders.length,
      byCategory,
    });
  } catch (err) {
    res.status(500).json({ message: "Error al obtener resumen", err: err.message });
  }
};

/* POST /api/staff/expenses */
export const createExpense = async (req, res) => {
  try {
    const { category, description, amount, date, locationId } = req.body;
    if (!category || !description?.trim() || amount == null || !date) {
      return res.status(400).json({ message: "category, description, amount y date son requeridos" });
    }
    const expense = await Expense.create({
      category,
      description: description.trim(),
      amount:      parseFloat(amount),
      date,
      locationId:  locationId || "tij-centro-01",
      createdBy:   req.staff?.name || req.staff?.email || "staff",
    });
    res.status(201).json({ expense });
  } catch (err) {
    res.status(500).json({ message: "Error al crear gasto", err: err.message });
  }
};

/* DELETE /api/staff/expenses/:id */
export const deleteExpense = async (req, res) => {
  try {
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Error al eliminar gasto", err: err.message });
  }
};
