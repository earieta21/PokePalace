import Inventory from "../models/Inventory.js";

/* GET /api/staff/inventory */
export const getInventory = async (req, res) => {
  try {
    const items = await Inventory.find().sort({ category: 1, item: 1 });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ message: "Error fetching inventory", err: err.message });
  }
};

/* POST /api/staff/inventory */
export const createItem = async (req, res) => {
  try {
    const item = await Inventory.create(req.body);
    res.status(201).json({ item });
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

    res.json({ item: existing });
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
