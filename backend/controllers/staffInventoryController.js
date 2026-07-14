import Inventory from "../models/Inventory.js";
import Expense from "../models/Expense.js";

// Cada sección del inventario tiene su categoría contable en Finanzas.
const EXPENSE_CATEGORY_BY_SECTION = {
  Comida:   "Ingredientes",
  Limpieza: "Limpieza",
  Empaque:  "Empaque",
  Otros:    "Otros",
};

/* Registra la compra como gasto en Finanzas (costo unitario × cantidad).
   Devuelve null si el artículo no tiene costo registrado; un fallo aquí
   no debe tumbar la operación de inventario. */
async function recordPurchaseExpense({ item, qty, staff }) {
  const cost = Number(item.cost) || 0;
  if (cost <= 0 || !(qty > 0)) return null;
  try {
    return await Expense.create({
      category:    EXPENSE_CATEGORY_BY_SECTION[item.section] || "Otros",
      description: `Compra de inventario: ${item.item} (${qty} ${item.unit})`,
      amount:      parseFloat((qty * cost).toFixed(2)),
      date:        new Date().toISOString().slice(0, 10),
      source:      "inventario",
      createdBy:   staff?.name || staff?.email || "staff",
    });
  } catch {
    return null;
  }
}

/* GET /api/staff/inventory */
export const getInventory = async (req, res) => {
  try {
    const items = await Inventory.find().sort({ category: 1, item: 1 });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ message: "Error fetching inventory", err: err.message });
  }
};

/* POST /api/staff/inventory — body opcional: { registerExpense: true }
   registra la existencia inicial como gasto en Finanzas si tiene costo. */
export const createItem = async (req, res) => {
  try {
    const { registerExpense, ...data } = req.body;
    const item = await Inventory.create(data);
    const expense = registerExpense
      ? await recordPurchaseExpense({ item, qty: item.qty, staff: req.staff })
      : null;
    res.status(201).json({ item, expense });
  } catch (err) {
    res.status(400).json({ message: "Error creating item", err: err.message });
  }
};

/* PATCH /api/staff/inventory/:id */
export const updateItem = async (req, res) => {
  try {
    const item = await Inventory.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json({ item });
  } catch (err) {
    res.status(400).json({ message: "Error updating item", err: err.message });
  }
};

/* PATCH /api/staff/inventory/:id/restock — body: { amount }
   Adds `amount` to the existing qty instead of overwriting it, so staff
   receiving a delivery doesn't have to do mental math (current + arrived). */
export const restockItem = async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ message: "Cantidad inválida" });
    }
    const existing = await Inventory.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Item not found" });

    const nextQty = Math.max(0, existing.qty + amount);
    existing.qty = nextQty;
    existing.lastRestockAt = new Date();
    await existing.save();

    // Recibir mercancía es una compra: se anota sola en Finanzas
    // (salvo que el cliente lo desactive con registerExpense: false).
    const expense = req.body.registerExpense === false
      ? null
      : await recordPurchaseExpense({ item: existing, qty: amount, staff: req.staff });

    res.json({ item: existing, expense });
  } catch (err) {
    res.status(400).json({ message: "Error actualizando existencia", err: err.message });
  }
};

/* GET /api/staff/inventory/low-stock */
export const getLowStock = async (req, res) => {
  try {
    const items = await Inventory.find({ $expr: { $lte: ["$qty", "$minQty"] } }).sort({ item: 1 });
    res.json({ items, count: items.length });
  } catch (err) {
    res.status(500).json({ message: "Error fetching low stock", err: err.message });
  }
};

/* DELETE /api/staff/inventory/:id */
export const deleteItem = async (req, res) => {
  try {
    await Inventory.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting item", err: err.message });
  }
};
