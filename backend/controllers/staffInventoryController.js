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

/* DELETE /api/staff/inventory/:id */
export const deleteItem = async (req, res) => {
  try {
    await Inventory.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting item", err: err.message });
  }
};
