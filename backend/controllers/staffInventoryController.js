import Inventory from "../models/Inventory.js";
import Expense from "../models/Expense.js";
import mongoose from "mongoose";
import { dateKeyInTimeZone, normalizeRestockLines } from "../utils/inventoryRestock.js";

// Cada sección del inventario tiene su categoría contable en Finanzas.
const EXPENSE_CATEGORY_BY_SECTION = {
  Comida:   "Ingredientes",
  Limpieza: "Limpieza",
  Empaque:  "Empaque",
  Otros:    "Otros",
};

const INVENTORY_EDITABLE_FIELDS = [
  "item", "section", "category", "unit", "qty", "minQty",
  "cost", "supplier", "menuKeys",
];

const pickInventoryFields = (body = {}) => Object.fromEntries(
  INVENTORY_EDITABLE_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(body, field))
    .map((field) => [field, body[field]])
);

/* Registra la compra como gasto en Finanzas (costo unitario × cantidad).
   Devuelve null si el artículo no tiene costo registrado; un fallo aquí
   no debe tumbar la operación de inventario. */
async function recordPurchaseExpense({ item, qty, staff, sourceRef = null, strict = false }) {
  const cost = Number(item.cost) || 0;
  if (cost <= 0 || !(qty > 0)) return null;
  try {
    const payload = {
      category:    EXPENSE_CATEGORY_BY_SECTION[item.section] || "Otros",
      description: `Compra de inventario: ${item.item} (${qty} ${item.unit})`,
      amount:      parseFloat((qty * cost).toFixed(2)),
      date:        dateKeyInTimeZone(),
      source:      "inventario",
      createdBy:   staff?.name || staff?.email || "staff",
      ...(sourceRef ? { sourceRef } : {}),
    };
    if (!sourceRef) return await Expense.create(payload);

    return await Expense.findOneAndUpdate(
      { sourceRef },
      { $setOnInsert: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (sourceRef && error?.code === 11000) {
      const existing = await Expense.findOne({ sourceRef });
      if (existing) return existing;
    }
    if (strict) throw error;
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
    const { registerExpense } = req.body;
    const data = pickInventoryFields(req.body);
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
    const item = await Inventory.findByIdAndUpdate(req.params.id, pickInventoryFields(req.body), {
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
    if (!Number.isFinite(amount) || amount <= 0) {
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

/* POST /api/staff/inventory/restock-batch
   body: { requestId, lines: [{ itemId, amount }] }

   Each Inventory update records requestId atomically alongside the increment.
   A retry can therefore finish missing lines without adding successful ones a
   second time. Expense.sourceRef provides the same guarantee in Finanzas. */
export const restockBatch = async (req, res) => {
  try {
    const requestId = String(req.body.requestId || "").trim();
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(requestId)) {
      return res.status(400).json({ message: "Identificador de recepción inválido" });
    }

    let lines;
    try {
      lines = normalizeRestockLines(req.body.lines);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    if (lines.some(({ itemId }) => !mongoose.isValidObjectId(itemId))) {
      return res.status(400).json({ message: "La recepción contiene un artículo inválido" });
    }

    // Validate the entire batch before applying its first line. Once valid,
    // partial network/database failures are safe because every line is atomic.
    const existingItems = await Inventory.find({
      _id: { $in: lines.map(({ itemId }) => itemId) },
    });
    if (existingItems.length !== lines.length) {
      return res.status(404).json({ message: "Uno de los artículos ya no existe" });
    }

    const existingById = new Map(existingItems.map((item) => [String(item._id), item]));
    const results = await Promise.all(lines.map(async ({ itemId, amount }) => {
      let item = await Inventory.findOneAndUpdate(
        { _id: itemId, restockRequestIds: { $ne: requestId } },
        {
          $inc: { qty: amount },
          $set: { lastRestockAt: new Date() },
          $addToSet: { restockRequestIds: requestId },
        },
        { new: true, runValidators: true }
      );

      const replayed = !item;
      if (!item) item = await Inventory.findById(itemId);
      if (!item) throw new Error("Uno de los artículos ya no existe");

      const expense = req.body.registerExpense === false
        ? null
        : await recordPurchaseExpense({
            item: item || existingById.get(itemId),
            qty: amount,
            staff: req.staff,
            sourceRef: `inventory-receipt:${requestId}:${itemId}`,
            strict: true,
          });

      return { item, expense, replayed };
    }));

    return res.json({
      requestId,
      items: results.map(({ item }) => item),
      expenses: results.map(({ expense }) => expense).filter(Boolean),
      replayed: results.every(({ replayed }) => replayed),
    });
  } catch (err) {
    return res.status(500).json({
      message: "La recepción quedó pendiente de completar; reintenta con el mismo folio",
      err: err.message,
    });
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
