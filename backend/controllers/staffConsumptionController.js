import mongoose from "mongoose";
import Inventory from "../models/Inventory.js";
import StaffConsumption from "../models/StaffConsumption.js";
import StaffUser from "../models/StaffUser.js";
import { actorFromStaff } from "../utils/auditLog.js";
import { recordInventoryMovement } from "../utils/inventoryLedger.js";
import { dateKeyInTimeZone } from "../utils/timeZone.js";
import {
  EMPLOYEE_DAILY_PROTEIN_GRAMS,
  gramsToInventoryQuantity,
  isProteinInventoryItem,
} from "../utils/staffConsumption.js";

const SENIOR_ROLES = new Set(["manager", "admin", "owner"]);
const sameId = (left, right) => String(left) === String(right);
const locationIsAllowed = (actor, target) =>
  !actor.locationId || actor.locationId === target.locationId;

const canAccessConsumption = (actor, row) => {
  if (sameId(actor.id, row.staffId)) return true;
  if (!SENIOR_ROLES.has(actor.role)) return false;
  return !actor.locationId || actor.locationId === row.locationId;
};

const queryScope = (staff) => {
  if (!SENIOR_ROLES.has(staff.role)) return { staffId: staff.id };
  return staff.locationId ? { locationId: staff.locationId } : {};
};

async function applyInventoryForConsumption(consumption, actor) {
  // La cantidad y el id del consumo ya quedaron validados y guardados. Este
  // update atómico une el decremento con su marcador de idempotencia.
  const inventoryBefore = await Inventory.findOneAndUpdate(
    {
      _id: consumption.proteinItemId,
      processedConsumptionIds: { $ne: consumption._id },
      qty: { $gte: consumption.inventoryQty },
    },
    {
      $inc: { qty: -consumption.inventoryQty },
      $addToSet: { processedConsumptionIds: consumption._id },
    },
    { new: false, runValidators: true }
  );

  if (inventoryBefore) {
    const qtyBefore = Number(inventoryBefore.qty) || 0;
    const qtyAfter = Number((qtyBefore - consumption.inventoryQty).toFixed(6));
    await recordInventoryMovement({
      itemId: consumption.proteinItemId,
      itemName: consumption.proteinName,
      type: "internal_consumption",
      delta: -consumption.inventoryQty,
      qtyBefore,
      qtyAfter,
      ...actorFromStaff(actor),
      reference: String(consumption._id),
      referenceType: "consumption",
      reason: `${consumption.meal}: ${consumption.staffName}`,
      locationId: consumption.locationId,
      idempotencyKey: `consumption:${consumption._id}:${consumption.proteinItemId}`,
    });
  } else {
    const current = await Inventory.findById(consumption.proteinItemId)
      .select("item qty +processedConsumptionIds")
      .lean();
    const wasAlreadyApplied = (current?.processedConsumptionIds || [])
      .some((id) => sameId(id, consumption._id));
    if (!wasAlreadyApplied) return null;
  }

  return StaffConsumption.findByIdAndUpdate(
    consumption._id,
    { $set: { status: "recorded" } },
    { new: true, runValidators: true }
  );
}

/* GET /api/staff/consumption?limit=50&date=YYYY-MM-DD */
export const getConsumptions = async (req, res) => {
  try {
    const requestedDate = typeof req.query.date === "string" ? req.query.date.trim() : "";
    if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return res.status(400).json({ message: "Fecha inválida" });
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const scope = queryScope(req.staff);
    const filter = {
      ...scope,
      status: "recorded",
      ...(requestedDate ? { dateKey: requestedDate } : {}),
    };
    const today = dateKeyInTimeZone();

    const [logs, todayLogs, mineToday] = await Promise.all([
      StaffConsumption.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      StaffConsumption.find({ ...scope, status: "recorded", dateKey: today }).lean(),
      StaffConsumption.findOne({ staffId: req.staff.id, status: "recorded", dateKey: today }).lean(),
    ]);

    res.json({
      logs,
      policy: { employeeDailyMeals: 1, employeeDailyProteinGrams: EMPLOYEE_DAILY_PROTEIN_GRAMS },
      todayStatus: mineToday,
      stats: {
        todayMeals: todayLogs.length,
        todayProteinGrams: Number(todayLogs.reduce((sum, row) => sum + row.proteinGrams, 0).toFixed(2)),
        todayProteinCost: Number(todayLogs.reduce((sum, row) => sum + row.proteinCost, 0).toFixed(2)),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "No se pudo consultar el consumo interno", err: err.message });
  }
};

/* POST /api/staff/consumption */
export const createConsumption = async (req, res) => {
  let created = null;
  try {
    const clientRequestId = String(req.body.clientRequestId || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(clientRequestId)) {
      return res.status(400).json({ message: "Identificador de registro inválido" });
    }

    const replay = await StaffConsumption.findOne({ clientRequestId });
    if (replay) {
      if (!canAccessConsumption(req.staff, replay)) {
        return res.status(403).json({ message: "Ese registro pertenece a otro integrante" });
      }
      if (replay.status === "pending") {
        const resumed = await applyInventoryForConsumption(replay, req.staff);
        if (!resumed) {
          await StaffConsumption.deleteOne({ _id: replay._id, status: "pending" });
          return res.status(409).json({ message: `No hay suficiente ${replay.proteinName} en inventario` });
        }
        return res.json({ consumption: resumed, replayed: true });
      }
      return res.json({ consumption: replay, replayed: true });
    }

    const targetId = req.body.staffId || req.staff.id;
    if (!mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ message: "Integrante inválido" });
    }
    if (!sameId(targetId, req.staff.id) && !SENIOR_ROLES.has(req.staff.role)) {
      return res.status(403).json({ message: "Solo puedes registrar tu propio consumo" });
    }

    const target = await StaffUser.findOne({ _id: targetId, active: true })
      .select("_id name role locationId")
      .lean();
    if (!target) return res.status(404).json({ message: "El integrante no está activo" });
    if (!locationIsAllowed(req.staff, target)) {
      return res.status(403).json({ message: "No puedes registrar consumo de otra sucursal" });
    }

    const grams = Number(req.body.proteinGrams);
    const isOwner = target.role === "owner";
    const maxGrams = isOwner ? 1000 : EMPLOYEE_DAILY_PROTEIN_GRAMS;
    if (!Number.isFinite(grams) || grams <= 0 || grams > maxGrams) {
      return res.status(400).json({
        message: isOwner
          ? "Captura una cantidad de proteína válida"
          : `La prestación diaria permite hasta ${EMPLOYEE_DAILY_PROTEIN_GRAMS} g de proteína`,
      });
    }

    if (!mongoose.isValidObjectId(req.body.proteinItemId)) {
      return res.status(400).json({ message: "Selecciona una proteína del inventario" });
    }
    const protein = await Inventory.findById(req.body.proteinItemId)
      .select("item category unit qty cost");
    if (!protein || !isProteinInventoryItem(protein)) {
      return res.status(400).json({ message: "El artículo seleccionado no está clasificado como proteína" });
    }
    const inventoryQty = gramsToInventoryQuantity(grams, protein.unit);
    if (inventoryQty == null) {
      return res.status(400).json({ message: "La proteína debe manejarse en kg o g dentro de Inventario" });
    }

    const today = dateKeyInTimeZone();
    const unitCost = Math.max(0, Number(protein.cost) || 0);
    const proteinCost = Number((unitCost * inventoryQty).toFixed(2));
    const cleanMeal = String(req.body.meal || "Bowl del personal").trim().slice(0, 120) || "Bowl del personal";
    const cleanNote = String(req.body.note || "").trim().slice(0, 300);
    const activePolicyKey = isOwner ? null : `${target._id}:${today}`;

    try {
      created = await StaffConsumption.create({
        staffId: target._id,
        staffName: target.name,
        staffRole: target.role,
        dateKey: today,
        locationId: target.locationId || req.staff.locationId || null,
        meal: cleanMeal,
        proteinItemId: protein._id,
        proteinName: protein.item,
        proteinGrams: grams,
        inventoryQty,
        inventoryUnit: protein.unit,
        unitCost,
        proteinCost,
        note: cleanNote,
        registeredById: req.staff.id,
        registeredByName: req.staff.name,
        clientRequestId,
        activePolicyKey,
      });
    } catch (err) {
      if (err?.code === 11000) {
        const existingRequest = await StaffConsumption.findOne({ clientRequestId });
        if (existingRequest && canAccessConsumption(req.staff, existingRequest)) {
          const resumed = existingRequest.status === "pending"
            ? await applyInventoryForConsumption(existingRequest, req.staff)
            : existingRequest;
          if (resumed) return res.json({ consumption: resumed, replayed: true });
        }
        // Si la pestaña se recargó después de un fallo, el navegador genera
        // otro requestId. La llave diaria permite encontrar y terminar el
        // registro pendiente sin descontar otra vez.
        const pendingPolicy = activePolicyKey
          ? await StaffConsumption.findOne({ activePolicyKey, status: "pending" })
          : null;
        if (pendingPolicy && canAccessConsumption(req.staff, pendingPolicy)) {
          const resumed = await applyInventoryForConsumption(pendingPolicy, req.staff);
          if (resumed) return res.json({ consumption: resumed, replayed: true });
          await StaffConsumption.deleteOne({ _id: pendingPolicy._id, status: "pending" });
          return res.status(409).json({ message: `No hay suficiente ${pendingPolicy.proteinName} en inventario` });
        }
        return res.status(409).json({ message: `${target.name} ya registró su comida de hoy` });
      }
      throw err;
    }

    const recorded = await applyInventoryForConsumption(created, req.staff);
    if (!recorded) {
      await StaffConsumption.deleteOne({ _id: created._id, status: "pending" });
      created = null;
      return res.status(409).json({ message: `No hay suficiente ${protein.item} en inventario` });
    }

    res.status(201).json({ consumption: recorded });
  } catch (err) {
    // Un registro pendiente se conserva: el mismo clientRequestId puede
    // reanudarlo de forma segura después de un fallo transitorio.
    res.status(400).json({ message: "No se pudo registrar el consumo", err: err.message });
  }
};

/* DELETE /api/staff/consumption/:id — anula y devuelve la proteína. */
export const voidConsumption = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Registro inválido" });
    }
    const scope = req.staff.locationId ? { locationId: req.staff.locationId } : {};
    const row = await StaffConsumption.findOne({ _id: req.params.id, ...scope });
    if (!row) return res.status(404).json({ message: "Registro no encontrado" });
    if (row.status === "void") return res.json({ voided: true, id: row._id, replayed: true });

    // Se retira el marcador en el mismo update que devuelve la proteína. Si
    // se reintenta, ya no habrá marcador y por tanto no se volverá a sumar.
    const inventoryBefore = await Inventory.findOneAndUpdate(
      { _id: row.proteinItemId, processedConsumptionIds: row._id },
      {
        $inc: { qty: row.inventoryQty },
        $pull: { processedConsumptionIds: row._id },
      },
      { new: false, runValidators: true }
    );
    if (inventoryBefore) {
      const qtyBefore = Number(inventoryBefore.qty) || 0;
      const qtyAfter = Number((qtyBefore + row.inventoryQty).toFixed(6));
      await recordInventoryMovement({
        itemId: inventoryBefore._id,
        itemName: row.proteinName,
        type: "internal_consumption_reversal",
        delta: row.inventoryQty,
        qtyBefore,
        qtyAfter,
        ...actorFromStaff(req.staff),
        reference: String(row._id),
        referenceType: "consumption",
        reason: `Anulación: ${row.meal} de ${row.staffName}`,
        locationId: row.locationId,
        idempotencyKey: `consumption-reversal:${row._id}:${inventoryBefore._id}`,
      });
    }

    await StaffConsumption.updateOne(
      { _id: row._id },
      {
        $set: {
          status: "void",
          voidedAt: new Date(),
          voidedById: req.staff.id,
          voidedByName: req.staff.name,
          activePolicyKey: null,
        },
      }
    );

    res.json({ voided: true, id: row._id });
  } catch (err) {
    res.status(400).json({ message: "No se pudo anular el consumo", err: err.message });
  }
};
