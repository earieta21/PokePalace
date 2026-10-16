import mongoose from "mongoose";
import Disposable from "../models/Disposable.js";
import DisposableMovement from "../models/DisposableMovement.js";
import { actorFromStaff, recordAudit } from "../utils/auditLog.js";
import {
  DisposableValidationError,
  normalizeRequestId,
  sanitizeDisposableFields,
  toPieces,
} from "../utils/disposables.js";

const badRequest = (res, error) => {
  if (error instanceof DisposableValidationError) {
    res.status(400).json({ message: error.message });
    return true;
  }
  return false;
};

const cleanNote = (value) => (typeof value === "string" ? value.trim().slice(0, 200) : "");

async function logMovement(doc, { type, piecesBefore, piecesAfter, staff, note = "" }) {
  try {
    const { actorId, actorName } = actorFromStaff(staff);
    await DisposableMovement.create({
      disposableId: doc._id, name: doc.name, type,
      delta: piecesAfter - piecesBefore, piecesBefore, piecesAfter,
      actorId: mongoose.isValidObjectId(actorId) ? actorId : null,
      actorName, note,
    });
  } catch (error) {
    // La bitácora nunca debe tumbar el conteo que ya se guardó.
    console.error("disposable movement error:", error.message);
  }
}

const findOr404 = async (res, id) => {
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ message: "Desechable no encontrado" });
    return null;
  }
  const doc = await Disposable.findById(id);
  if (!doc) res.status(404).json({ message: "Desechable no encontrado" });
  return doc;
};

/* GET /api/staff/disposables */
export const listDisposables = async (req, res) => {
  try {
    const items = await Disposable.find().sort({ category: 1, name: 1 });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ message: "Error al cargar los desechables", err: err.message });
  }
};

/* POST /api/staff/disposables — { name, category, piecesPerPack, minPacks, packs, pieces } */
export const createDisposable = async (req, res) => {
  let fields;
  let pieces;
  try {
    fields = sanitizeDisposableFields(req.body);
    pieces = toPieces({ packs: req.body.packs, pieces: req.body.pieces }, fields.piecesPerPack);
  } catch (error) {
    if (badRequest(res, error)) return;
    throw error;
  }
  try {
    const staffName = req.staff?.name || req.staff?.email || "Staff";
    const doc = await Disposable.create({ ...fields, pieces, lastCountAt: new Date(), lastCountBy: staffName });
    await logMovement(doc, { type: "create", piecesBefore: 0, piecesAfter: pieces, staff: req.staff });
    await recordAudit({
      entity: "Disposable", entityId: doc._id, action: "create",
      changes: Object.entries({ ...fields, pieces }).map(([field, value]) => ({ field, oldValue: null, newValue: value })),
      ...actorFromStaff(req.staff), source: "manual",
    });
    res.status(201).json({ item: doc });
  } catch (err) {
    res.status(500).json({ message: "Error al crear el desechable", err: err.message });
  }
};

/* PATCH /api/staff/disposables/:id — nombre, categoría, piezas por paquete, mínimo */
export const updateDisposable = async (req, res) => {
  let fields;
  try {
    fields = sanitizeDisposableFields(req.body, { partial: true });
  } catch (error) {
    if (badRequest(res, error)) return;
    throw error;
  }
  try {
    const before = await findOr404(res, req.params.id);
    if (!before) return;
    const doc = await Disposable.findByIdAndUpdate(before._id, { $set: fields }, { new: true, runValidators: true });
    const changes = Object.keys(fields)
      .filter((field) => before[field] !== doc[field])
      .map((field) => ({ field, oldValue: before[field], newValue: doc[field] }));
    if (changes.length) {
      await recordAudit({ entity: "Disposable", entityId: doc._id, action: "update", changes, ...actorFromStaff(req.staff), source: "manual" });
    }
    res.json({ item: doc });
  } catch (err) {
    res.status(500).json({ message: "Error al guardar el desechable", err: err.message });
  }
};

/* POST /api/staff/disposables/:id/receive — { packs, pieces, requestId }
   Suma lo que llegó. Idempotente por requestId. */
export const receiveDisposable = async (req, res) => {
  try {
    const current = await findOr404(res, req.params.id);
    if (!current) return;
    let amount;
    let requestId;
    try {
      requestId = normalizeRequestId(req.body.requestId);
      amount = toPieces({ packs: req.body.packs, pieces: req.body.pieces }, current.piecesPerPack);
      if (amount <= 0) throw new DisposableValidationError("Captura cuántos paquetes o piezas llegaron");
    } catch (error) {
      if (badRequest(res, error)) return;
      throw error;
    }
    const doc = await Disposable.findOneAndUpdate(
      { _id: current._id, requestIds: { $ne: requestId } },
      { $inc: { pieces: amount }, $addToSet: { requestIds: requestId } },
      { new: true }
    );
    if (!doc) return res.json({ item: await Disposable.findById(current._id), replayed: true });
    await logMovement(doc, {
      type: "receive", piecesBefore: doc.pieces - amount, piecesAfter: doc.pieces,
      staff: req.staff, note: cleanNote(req.body.note),
    });
    res.json({ item: doc });
  } catch (err) {
    res.status(500).json({ message: "Error al registrar la recepción", err: err.message });
  }
};

/* POST /api/staff/disposables/:id/use — { packs, pieces, requestId }
   Saca piezas (se usaron, se rompieron…). No deja la existencia en negativo. */
export const useDisposable = async (req, res) => {
  try {
    const current = await findOr404(res, req.params.id);
    if (!current) return;
    let amount;
    let requestId;
    try {
      requestId = normalizeRequestId(req.body.requestId);
      amount = toPieces({ packs: req.body.packs, pieces: req.body.pieces }, current.piecesPerPack);
      if (amount <= 0) throw new DisposableValidationError("Captura cuántos paquetes o piezas salieron");
    } catch (error) {
      if (badRequest(res, error)) return;
      throw error;
    }
    const doc = await Disposable.findOneAndUpdate(
      { _id: current._id, requestIds: { $ne: requestId }, pieces: { $gte: amount } },
      { $inc: { pieces: -amount }, $addToSet: { requestIds: requestId } },
      { new: true }
    );
    if (!doc) {
      const latest = await Disposable.findById(current._id).select("+requestIds");
      if (latest?.requestIds?.includes(requestId)) {
        latest.requestIds = undefined;
        return res.json({ item: latest, replayed: true });
      }
      return res.status(409).json({
        message: `Solo hay ${latest?.pieces ?? 0} piezas registradas. Haz un conteo si la existencia no cuadra.`,
      });
    }
    await logMovement(doc, {
      type: "use", piecesBefore: doc.pieces + amount, piecesAfter: doc.pieces,
      staff: req.staff, note: cleanNote(req.body.note),
    });
    res.json({ item: doc });
  } catch (err) {
    res.status(500).json({ message: "Error al registrar la salida", err: err.message });
  }
};

/* POST /api/staff/disposables/:id/count — { packs, pieces, expectedPieces }
   Conteo físico: reemplaza la existencia. Si alguien más la cambió mientras
   se contaba (expectedPieces distinto), se pide volver a contar. */
export const countDisposable = async (req, res) => {
  try {
    const current = await findOr404(res, req.params.id);
    if (!current) return;
    let counted;
    try {
      counted = toPieces({ packs: req.body.packs, pieces: req.body.pieces }, current.piecesPerPack);
    } catch (error) {
      if (badRequest(res, error)) return;
      throw error;
    }
    const expected = req.body.expectedPieces;
    const filter = { _id: current._id };
    if (expected !== undefined && expected !== null) filter.pieces = Number(expected);
    const staffName = req.staff?.name || req.staff?.email || "Staff";
    const before = await Disposable.findOneAndUpdate(
      filter,
      { $set: { pieces: counted, lastCountAt: new Date(), lastCountBy: staffName } },
      { new: false }
    );
    if (!before) {
      return res.status(409).json({ message: "La existencia cambió mientras contabas. Actualiza y vuelve a capturar el conteo." });
    }
    const doc = await Disposable.findById(current._id);
    if (before.pieces !== counted) {
      await logMovement(doc, {
        type: "count", piecesBefore: before.pieces, piecesAfter: counted,
        staff: req.staff, note: cleanNote(req.body.note),
      });
    }
    res.json({ item: doc });
  } catch (err) {
    res.status(500).json({ message: "Error al guardar el conteo", err: err.message });
  }
};

/* DELETE /api/staff/disposables/:id */
export const deleteDisposable = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Desechable no encontrado" });
    const doc = await Disposable.findByIdAndDelete(req.params.id).lean();
    if (doc) {
      await recordAudit({
        entity: "Disposable", entityId: doc._id, action: "delete",
        changes: ["name", "category", "piecesPerPack", "pieces", "minPacks"].map((field) => ({ field, oldValue: doc[field] ?? null, newValue: null })),
        ...actorFromStaff(req.staff), source: "manual",
      });
    }
    res.json({ message: "Eliminado" });
  } catch (err) {
    res.status(500).json({ message: "Error al eliminar el desechable", err: err.message });
  }
};

/* GET /api/staff/disposables/:id/movements */
export const listDisposableMovements = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.json({ movements: [] });
    const movements = await DisposableMovement.find({ disposableId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ movements });
  } catch (err) {
    res.status(500).json({ message: "Error al cargar los movimientos", err: err.message });
  }
};
