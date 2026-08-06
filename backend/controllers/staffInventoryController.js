import Inventory from "../models/Inventory.js";
import Expense from "../models/Expense.js";
import InventoryMovement from "../models/InventoryMovement.js";
import mongoose from "mongoose";
import { dateKeyInTimeZone, normalizeRestockLines } from "../utils/inventoryRestock.js";
import { recordAudit, diffFields, actorFromStaff } from "../utils/auditLog.js";
import { recordInventoryMovement } from "../utils/inventoryLedger.js";
import { computeWeightedAverageCost } from "../utils/inventoryCost.js";

// Cada sección del inventario tiene su categoría contable en Finanzas.
const EXPENSE_CATEGORY_BY_SECTION = {
  Comida:   "Ingredientes",
  Bebidas:  "Bebidas",
  Limpieza: "Limpieza",
  Empaque:  "Empaque",
  Otros:    "Otros",
};

const INVENTORY_EDITABLE_FIELDS = [
  "item", "section", "category", "unit", "qty", "minQty",
  "cost", "supplier", "menuKeys",
  "portionQty", "yieldPct", "purchaseUnit", "purchaseConversionFactor",
];

const pickInventoryFields = (body = {}) => Object.fromEntries(
  INVENTORY_EDITABLE_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(body, field))
    .map((field) => [field, body[field]])
);

/* Registra la compra como gasto en Finanzas (costo unitario × cantidad).
   Devuelve null si el artículo no tiene costo registrado; un fallo aquí
   no debe tumbar la operación de inventario. */
async function recordPurchaseExpense({ item, qty, staff, sourceRef = null, strict = false, costOverride = null }) {
  const cost = costOverride != null ? Number(costOverride) || 0 : Number(item.cost) || 0;
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
    const item = await Inventory.create({
      ...data,
      lastRestockAt: new Date(),
      lastRestockBy: req.staff?.name || req.staff?.email || "Staff",
    });
    const expense = registerExpense
      ? await recordPurchaseExpense({ item, qty: item.qty, staff: req.staff })
      : null;

    const actor = actorFromStaff(req.staff);
    if (item.qty > 0) {
      await recordInventoryMovement({
        itemId: item._id, itemName: item.item, type: "manual_adjustment",
        delta: item.qty, qtyBefore: 0, qtyAfter: item.qty,
        ...actor, referenceType: "manual",
      });
    }
    await recordAudit({
      entity: "Inventory", entityId: item._id, action: "create",
      changes: Object.keys(data).map((field) => ({ field, oldValue: null, newValue: item[field] ?? null })),
      ...actor, source: "manual",
    });

    res.status(201).json({ item, expense });
  } catch (err) {
    res.status(400).json({ message: "Error creating item", err: err.message });
  }
};

/* PATCH /api/staff/inventory/:id */
export const updateItem = async (req, res) => {
  try {
    const updateData = pickInventoryFields(req.body);
    const before = await Inventory.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ message: "Item not found" });

    const item = await Inventory.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    const changedFields = diffFields(before, item.toObject(), Object.keys(updateData));
    const actor = actorFromStaff(req.staff);

    const qtyChange = changedFields.find((c) => c.field === "qty");
    if (qtyChange) {
      await recordInventoryMovement({
        itemId: item._id, itemName: item.item, type: "manual_adjustment",
        delta: qtyChange.newValue - qtyChange.oldValue,
        qtyBefore: qtyChange.oldValue, qtyAfter: qtyChange.newValue,
        ...actor, referenceType: "manual",
      });
    }

    const otherChanges = changedFields.filter((c) => c.field !== "qty");
    if (otherChanges.length > 0) {
      await recordAudit({
        entity: "Inventory", entityId: item._id, action: "update",
        changes: otherChanges, ...actor, source: "manual",
      });
    }

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

    const rawCost = req.body.cost;
    const hasNewCost = rawCost !== undefined && rawCost !== null && rawCost !== "" && Number.isFinite(Number(rawCost)) && Number(rawCost) >= 0;

    const qtyBefore = existing.qty;
    const costBefore = existing.cost;
    const nextQty = Math.max(0, existing.qty + amount);
    // Costo promedio ponderado -- nunca se sobreescribe con el precio más
    // reciente sin más: se pondera contra lo que ya había en existencia.
    const nextCost = hasNewCost
      ? computeWeightedAverageCost({ qtyBefore, costBefore, qtyReceived: amount, costReceived: Number(rawCost) })
      : existing.cost;

    existing.qty = nextQty;
    if (hasNewCost) existing.cost = nextCost;
    existing.lastRestockAt = new Date();
    existing.lastRestockBy = req.staff?.name || req.staff?.email || "Staff";
    await existing.save();

    // Recibir mercancía es una compra: se anota sola en Finanzas, con el
    // costo REAL de esta compra (no el promedio ponderado resultante).
    const expense = req.body.registerExpense === false
      ? null
      : await recordPurchaseExpense({ item: existing, qty: amount, staff: req.staff, costOverride: hasNewCost ? Number(rawCost) : null });

    const actor = actorFromStaff(req.staff);
    await recordInventoryMovement({
      itemId: existing._id, itemName: existing.item, type: "restock",
      delta: nextQty - qtyBefore, qtyBefore, qtyAfter: nextQty,
      cost: hasNewCost ? nextCost : null,
      ...actor, referenceType: "manual",
    });

    if (hasNewCost && nextCost !== costBefore) {
      await recordAudit({
        entity: "Inventory", entityId: existing._id, action: "update",
        changes: [{ field: "cost", oldValue: costBefore, newValue: nextCost }],
        ...actor, source: "manual", reason: "Costo promedio ponderado tras recepción",
      });
    }

    res.json({ item: existing, expense });
  } catch (err) {
    res.status(400).json({ message: "Error actualizando existencia", err: err.message });
  }
};

/* POST /api/staff/inventory/restock-batch
   body: { requestId, lines: [{ itemId, amount, cost? }] }

   `cost` es opcional y es el costo unitario de ESTA compra. Si se manda,
   el costo del artículo se recalcula como promedio ponderado contra lo
   que ya había en existencia (ver computeWeightedAverageCost) y se usa
   el costo real de la compra para el gasto en Finanzas; si no se manda,
   se conserva el costo anterior del artículo.

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
    const actor = actorFromStaff(req.staff);
    const results = await Promise.all(lines.map(async ({ itemId, amount, cost }) => {
      const hasNewCost = Number.isFinite(cost) && cost >= 0;
      const before = existingById.get(itemId);
      const weightedCost = hasNewCost && before
        ? computeWeightedAverageCost({ qtyBefore: before.qty, costBefore: before.cost, qtyReceived: amount, costReceived: cost })
        : null;

      let item = await Inventory.findOneAndUpdate(
        { _id: itemId, restockRequestIds: { $ne: requestId } },
        {
          $inc: { qty: amount },
          $set: {
            lastRestockAt: new Date(),
            lastRestockBy: req.staff?.name || req.staff?.email || "Staff",
            ...(hasNewCost ? { cost: weightedCost } : {}),
          },
          $addToSet: { restockRequestIds: requestId },
        },
        { new: true, runValidators: true }
      );

      const replayed = !item;
      if (!item) item = await Inventory.findById(itemId);
      if (!item) throw new Error("Uno de los artículos ya no existe");

      // Finanzas registra el costo REAL de esta compra, no el promedio
      // ponderado resultante -- lo que de verdad se pagó por esta recepción.
      const expense = req.body.registerExpense === false
        ? null
        : await recordPurchaseExpense({
            item: item || existingById.get(itemId),
            qty: amount,
            staff: req.staff,
            sourceRef: `inventory-receipt:${requestId}:${itemId}`,
            strict: true,
            costOverride: hasNewCost ? cost : null,
          });

      if (!replayed) {
        const qtyBefore = before?.qty ?? Math.max(0, item.qty - amount);
        await recordInventoryMovement({
          itemId: item._id, itemName: item.item, type: "restock_batch",
          delta: item.qty - qtyBefore, qtyBefore, qtyAfter: item.qty,
          cost: hasNewCost ? weightedCost : null,
          ...actor, reference: requestId, referenceType: "restockRequest",
          idempotencyKey: `batch:${requestId}:${itemId}`,
        });

        if (hasNewCost && before && weightedCost !== before.cost) {
          await recordAudit({
            entity: "Inventory", entityId: item._id, action: "update",
            changes: [{ field: "cost", oldValue: before.cost, newValue: weightedCost }],
            ...actor, source: "manual", reason: "Costo promedio ponderado tras recepción por lote",
          });
        }
      }

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

/* POST /api/staff/inventory/backfill-expenses
   Registra en Finanzas el valor de las existencias que YA estaban cargadas
   en el inventario (p. ej. la carga inicial antes de abrir), que nunca
   pasaron por "Recibir mercancía" y por eso no generaron gasto. Idempotente
   vía sourceRef — correrlo varias veces no duplica nada. */
export const backfillInventoryExpenses = async (req, res) => {
  try {
    const items = await Inventory.find({ qty: { $gt: 0 }, cost: { $gt: 0 } });
    const results = await Promise.all(items.map((item) =>
      recordPurchaseExpense({
        item,
        qty: item.qty,
        staff: req.staff,
        sourceRef: `inventory-initial:${item._id}`,
      })
    ));
    const created = results.filter(Boolean);
    const total = created.reduce((sum, expense) => sum + expense.amount, 0);
    res.json({
      itemsConsiderados: items.length,
      gastosRegistrados: created.length,
      total: parseFloat(total.toFixed(2)),
    });
  } catch (err) {
    res.status(500).json({ message: "Error al registrar existencias iniciales", err: err.message });
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
    const item = await Inventory.findByIdAndDelete(req.params.id).lean();
    if (item) {
      await recordAudit({
        entity: "Inventory", entityId: item._id, action: "delete",
        changes: INVENTORY_EDITABLE_FIELDS.map((field) => ({ field, oldValue: item[field] ?? null, newValue: null })),
        ...actorFromStaff(req.staff), source: "manual",
      });
    }
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting item", err: err.message });
  }
};

/* GET /api/staff/inventory/:id/movements?limit=&skip= */
export const getItemMovements = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Number(req.query.skip) || 0;
    const movements = await InventoryMovement.find({ itemId: req.params.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    res.json({ movements });
  } catch (err) {
    res.status(500).json({ message: "Error fetching movements", err: err.message });
  }
};
