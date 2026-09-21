import Preparation from "../models/Preparation.js";
import Inventory from "../models/Inventory.js";
import { preparationCost } from "../utils/preparationCost.js";

const clean = (value, max = 120) => String(value ?? "").trim().slice(0, max);
const positive = (value) => Math.max(0, Number(value) || 0);

/**
 * El precio unitario de una línea ligada al inventario se lee en vivo: así la
 * receta no se queda con un precio viejo cuando cambia el del proveedor, que
 * es justo lo que pasaba en la hoja de cálculo.
 */
const withLivePrices = (prep, inventoryById) => {
  const doc = typeof prep.toObject === "function" ? prep.toObject() : prep;
  doc.ingredients = (doc.ingredients || []).map((line) => {
    const linked = line.inventoryItemId && inventoryById.get(String(line.inventoryItemId));
    if (!linked) return { ...line, priceSource: "manual" };
    return {
      ...line,
      unitPrice: Number(linked.cost) || 0,
      unit: line.unit || linked.unit,
      priceSource: "inventario",
      inventoryItemName: linked.item,
    };
  });
  return doc;
};

const buildResponse = async () => {
  const [preps, inventory] = await Promise.all([
    Preparation.find({}).sort({ tipologia: 1, name: 1 }),
    Inventory.find({}, { item: 1, unit: 1, cost: 1 }).lean(),
  ]);
  const inventoryById = new Map(inventory.map((i) => [String(i._id), i]));

  return {
    preparations: preps.map((prep) => {
      const withPrices = withLivePrices(prep, inventoryById);
      return { ...withPrices, ...preparationCost(withPrices) };
    }),
    inventory: inventory.map((i) => ({ id: String(i._id), item: i.item, unit: i.unit, cost: i.cost })),
  };
};

export const listPreparations = async (req, res) => {
  try {
    res.json(await buildResponse());
  } catch (err) {
    console.error("listPreparations error:", err);
    res.status(500).json({ msg: "No se pudieron cargar las preparaciones" });
  }
};

const sanitize = (body) => ({
  name: clean(body?.name),
  tipologia: clean(body?.tipologia, 40) || "aderezo",
  menuKey: clean(body?.menuKey, 40) || null,
  yieldPortions: positive(body?.yieldPortions),
  notes: clean(body?.notes, 500),
  ingredients: (Array.isArray(body?.ingredients) ? body.ingredients : [])
    .filter((line) => clean(line?.name))
    .slice(0, 30)
    .map((line) => ({
      name: clean(line.name),
      unit: clean(line.unit, 12) || "kg",
      presentation: positive(line.presentation),
      recipeAmount: positive(line.recipeAmount),
      unitPrice: positive(line.unitPrice),
      flatCost: positive(line.flatCost),
      inventoryItemId: line.inventoryItemId || null,
    })),
});

export const createPreparation = async (req, res) => {
  try {
    const data = sanitize(req.body);
    if (!data.name) return res.status(400).json({ msg: "Ponle nombre a la receta" });
    await Preparation.create({ ...data, updatedBy: req.staff?.name || null });
    res.status(201).json(await buildResponse());
  } catch (err) {
    console.error("createPreparation error:", err);
    res.status(500).json({ msg: "No se pudo guardar la receta" });
  }
};

export const updatePreparation = async (req, res) => {
  try {
    const data = sanitize(req.body);
    if (!data.name) return res.status(400).json({ msg: "Ponle nombre a la receta" });
    const updated = await Preparation.findByIdAndUpdate(
      req.params.id,
      { ...data, updatedBy: req.staff?.name || null },
      { new: true }
    );
    if (!updated) return res.status(404).json({ msg: "Esa receta ya no existe" });
    res.json(await buildResponse());
  } catch (err) {
    console.error("updatePreparation error:", err);
    res.status(500).json({ msg: "No se pudo guardar la receta" });
  }
};

export const deletePreparation = async (req, res) => {
  try {
    await Preparation.findByIdAndDelete(req.params.id);
    res.json(await buildResponse());
  } catch (err) {
    console.error("deletePreparation error:", err);
    res.status(500).json({ msg: "No se pudo borrar la receta" });
  }
};
