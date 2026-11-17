import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import TimeRecord from "../models/TimeRecord.js";
import ChecklistRecord from "../models/ChecklistRecord.js";
import TempRecord from "../models/TempRecord.js";
import Announcement from "../models/Announcement.js";
import Schedule from "../models/Schedule.js";
import StaffUser from "../models/StaffUser.js";
import { comparePin, hashPin, isValidPinForRole, isWeakPin, pinLengthForRole } from "../utils/staffPin.js";
import { isWithinRestaurant, MAX_DISTANCE_METERS } from "../utils/geo.js";
import {
  canAssignStaffRole,
  canManageStaffRole,
  isStaffRole,
  manageableRolesFor,
} from "../utils/staffRoles.js";
import { dateKeyInTimeZone } from "../utils/timeZone.js";
import { recordAudit, diffFields, actorFromStaff } from "../utils/auditLog.js";
import { ensureOpenShiftIndex } from "../utils/openShiftIndex.js";

const LOCATION_ERROR_MSG = `Debes estar en el restaurante para marcar tu entrada/salida (dentro de ${MAX_DISTANCE_METERS}m).`;

// Valida que el body traiga coordenadas y que estén dentro del radio del
// local. Devuelve un mensaje de error si algo falla, o null si está bien.
// El dueño queda exento: puede operar sin estar físicamente en el local.
function checkStaffLocation(req) {
  if (req.staff?.role === "owner") return null;
  const { lat, lng } = req.body || {};
  if (typeof lat !== "number" || typeof lng !== "number") {
    return "No se pudo obtener tu ubicación. Activa el permiso de ubicación e intenta de nuevo.";
  }
  if (!isWithinRestaurant(lat, lng)) {
    return LOCATION_ERROR_MSG;
  }
  return null;
}

const sameId = (left, right) => String(left) === String(right);

const requestedLocationIsAllowed = (req, locationId) =>
  !req.staff.locationId || req.staff.locationId === locationId;

const safeMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
};

async function wouldRemoveLastOwner(employee, update = {}) {
  const removesOwner = employee.role === "owner" && (
    update.active === false || (update.role !== undefined && update.role !== "owner")
  );
  if (!removesOwner) return false;
  const otherOwners = await StaffUser.countDocuments({
    _id: { $ne: employee._id },
    role: "owner",
    active: true,
  });
  return otherOwners === 0;
}

/* ── EMPLOYEES ──────────────────────────────────────────────────────────── */

export const getKioskEmployees = async (req, res) => {
  const { locationId } = req.query;
  if (!locationId) return res.status(400).json({ message: "locationId requerido" });
  if (!requestedLocationIsAllowed(req, locationId)) {
    return res.status(403).json({ message: "No puedes consultar otra sucursal" });
  }
  try {
    const employees = await StaffUser.find({ locationId, active: true })
      .select("_id name color")
      .sort({ name: 1 });
    res.json({ employees });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const getManagedKioskEmployees = async (req, res) => {
  const { locationId } = req.query;
  if (!locationId) return res.status(400).json({ message: "locationId requerido" });
  if (!requestedLocationIsAllowed(req, locationId)) {
    return res.status(403).json({ message: "No puedes administrar otra sucursal" });
  }
  try {
    const manageableRoles = manageableRolesFor(req.staff.role);
    const employees = await StaffUser.find({
      locationId,
      active: true,
      $or: [{ role: { $in: manageableRoles } }, { _id: req.staff.id }],
    })
      .select("_id name role color locationId active hourlyRate payType weeklySalary")
      .sort({ name: 1 });
    res.json({ employees });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const createKioskEmployee = async (req, res) => {
  const { name, role, pin, color, locationId, hourlyRate, payType, weeklySalary } = req.body;
  const requestedRole = role || "employee";
  if (!name?.trim() || !locationId) {
    return res.status(400).json({ message: "Nombre y PIN requeridos" });
  }
  if (!requestedLocationIsAllowed(req, locationId)) {
    return res.status(403).json({ message: "No puedes crear personal en otra sucursal" });
  }
  if (!isStaffRole(requestedRole) || !canAssignStaffRole(req.staff.role, requestedRole)) {
    return res.status(403).json({ message: "No tienes permiso para asignar ese rol" });
  }
  // Gerencia usa 6 dígitos; el resto, 4 (ver utils/staffPin.js).
  if (!isValidPinForRole(pin, requestedRole)) {
    return res.status(400).json({ message: `El PIN debe tener ${pinLengthForRole(requestedRole)} dígitos para ese puesto` });
  }
  if (isWeakPin(pin)) {
    return res.status(400).json({ message: "Ese PIN es muy fácil de adivinar. Evita números repetidos o seguidos." });
  }
  try {
    const candidates = await StaffUser.find({ locationId, active: true }).select("+pin");
    let pinConflict = false;
    for (const candidate of candidates) {
      if (await comparePin(pin, candidate.pin)) {
        pinConflict = true;
        break;
      }
    }
    if (pinConflict) return res.status(409).json({ message: "Ese PIN ya está en uso por otro empleado" });

    const slug = name.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9.]/g, "");
    const email = `${slug}.${Date.now()}@pokepalace.internal`;
    const password = await bcrypt.hash(crypto.randomBytes(32).toString("base64url"), 12);

    const employee = await StaffUser.create({
      name: name.trim(),
      role: requestedRole,
      pin: await hashPin(pin),
      pinLength: String(pin).length,
      color: color || "emerald",
      email,
      password,
      locationId,
      active: true,
      hourlyRate: safeMoney(hourlyRate),
      payType: payType === "weekly" ? "weekly" : "hourly",
      weeklySalary: safeMoney(weeklySalary),
    });

    res.status(201).json({
      employee: {
        _id: employee._id, name: employee.name,
        role: employee.role, color: employee.color,
        locationId: employee.locationId, hourlyRate: employee.hourlyRate,
        payType: employee.payType, weeklySalary: employee.weeklySalary,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Error creando empleado", err: err.message });
  }
};

export const updateKioskEmployee = async (req, res) => {
  try {
    const target = await StaffUser.findById(req.params.id)
      .select("_id name role locationId active");
    if (!target) return res.status(404).json({ message: "Empleado no encontrado" });
    if (sameId(target._id, req.staff.id)) {
      return res.status(403).json({ message: "No puedes modificar tu propia cuenta desde el panel" });
    }
    if (!requestedLocationIsAllowed(req, target.locationId)) {
      return res.status(403).json({ message: "No puedes administrar otra sucursal" });
    }
    if (!canManageStaffRole(req.staff.role, target.role)) {
      return res.status(403).json({ message: "No tienes permiso para modificar a este integrante" });
    }

    const allowed = ["name", "hourlyRate", "color", "role", "payType", "weeklySalary"];
    const update  = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    if (update.role !== undefined && (
      !isStaffRole(update.role) || !canAssignStaffRole(req.staff.role, update.role)
    )) {
      return res.status(403).json({ message: "No tienes permiso para asignar ese rol" });
    }
    if (update.hourlyRate !== undefined) update.hourlyRate = safeMoney(update.hourlyRate);
    if (update.weeklySalary !== undefined) update.weeklySalary = safeMoney(update.weeklySalary);
    if (update.payType !== undefined && update.payType !== "weekly") update.payType = "hourly";
    if (update.name !== undefined) {
      update.name = String(update.name).trim();
      if (!update.name) delete update.name;
    }

    if (await wouldRemoveLastOwner(target, update)) {
      return res.status(409).json({ message: "Debe permanecer al menos un dueño activo" });
    }

    const employee = await StaffUser.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
      .select("_id name role color locationId active hourlyRate payType weeklySalary");
    if (!employee) return res.status(404).json({ message: "Empleado no encontrado" });
    res.json({ employee });
  } catch (err) {
    res.status(500).json({ message: "Error actualizando empleado", err: err.message });
  }
};

export const removeKioskEmployee = async (req, res) => {
  try {
    const target = await StaffUser.findById(req.params.id)
      .select("_id role locationId active");
    if (!target) return res.status(404).json({ message: "Empleado no encontrado" });
    if (sameId(target._id, req.staff.id)) {
      return res.status(403).json({ message: "No puedes eliminar tu propia cuenta" });
    }
    if (!requestedLocationIsAllowed(req, target.locationId)) {
      return res.status(403).json({ message: "No puedes administrar otra sucursal" });
    }
    if (!canManageStaffRole(req.staff.role, target.role)) {
      return res.status(403).json({ message: "No tienes permiso para eliminar a este integrante" });
    }
    if (await wouldRemoveLastOwner(target, { active: false })) {
      return res.status(409).json({ message: "Debe permanecer al menos un dueño activo" });
    }

    await StaffUser.findByIdAndUpdate(req.params.id, { active: false }, { runValidators: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

/* ── TIME RECORDS ───────────────────────────────────────────────────────── */

export const clockIn = async (req, res) => {
  const { locationId } = req.body;
  const employeeId = req.staff.id;
  if (!locationId || !requestedLocationIsAllowed(req, locationId)) {
    return res.status(403).json({ message: "Sucursal no permitida" });
  }
  const locationError = checkStaffLocation(req);
  if (locationError) return res.status(403).json({ message: locationError });
  try {
    const existing = await TimeRecord.findOne({ employeeId, clockOut: null });
    if (existing) {
      if (existing.locationId !== locationId) return res.status(409).json({ message: "Tienes un turno abierto en otra sucursal." });
      return res.json({ record: existing, recovered: true });
    }
    try { await ensureOpenShiftIndex(); }
    catch {
      return res.status(503).json({ message: "No se pudo asegurar un único turno abierto. Gerencia debe revisar los registros de asistencia antes de registrar nuevas entradas." });
    }
    let record;
    try {
      record = await TimeRecord.create({ employeeId, clockIn: new Date(), date: dateKeyInTimeZone(), locationId });
    } catch (error) {
      // Covers both a concurrent insert and an acknowledged write whose
      // response was lost. Never create another record to recover it.
      const recovered = await TimeRecord.findOne({ employeeId, clockOut: null, locationId });
      if (recovered) return res.json({ record: recovered, recovered: true });
      throw error;
    }
    res.status(201).json({ record });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const clockOut = async (req, res) => {
  const employeeId = req.staff.id;
  const locationError = checkStaffLocation(req);
  if (locationError) return res.status(403).json({ message: locationError });
  try {
    const target = timeRecordTarget(req, employeeId);
    const open = await TimeRecord.findOne(target);
    if (!open) return res.status(404).json({ message: "No hay turno activo" });
    if (open.clockOut) return res.json({ record: open, recovered: true });
    const openBreak = open.breaks.find((b) => !b.end);
    if (openBreak) {
      return res.status(400).json({ message: "Termina tu lonche antes de marcar salida" });
    }
    const record = await TimeRecord.findOneAndUpdate(
      { _id: open._id, clockOut: null, breaks: { $not: { $elemMatch: { end: null } } } },
      { $set: { clockOut: new Date() } }, { new: true }
    );
    if (!record) {
      const latest = await TimeRecord.findOne(target);
      if (latest?.clockOut) return res.json({ record: latest, recovered: true });
      return res.status(409).json({ message: "El turno cambió. Actualiza y termina tu lonche antes de salir." });
    }
    res.json({ record });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : "No se pudo registrar la salida.", err: err.message });
  }
};

/* ── LONCHE (break) ─────────────────────────────────────────────────────── */

function timeRecordTarget(req, employeeId) {
  const { recordId } = req.body;
  if (recordId !== undefined && !/^[a-f\d]{24}$/i.test(recordId)) {
    throw Object.assign(new Error("Turno inválido"), { status: 400 });
  }
  return { employeeId, ...(req.staff.locationId ? { locationId: req.staff.locationId } : {}),
    ...(recordId ? { _id: recordId } : { clockOut: null }) };
}

export const startBreak = async (req, res) => {
  const employeeId = req.staff.id;
  const locationError = checkStaffLocation(req);
  if (locationError) return res.status(403).json({ message: locationError });
  try {
    const target = timeRecordTarget(req, employeeId);
    const open = await TimeRecord.findOne(target);
    if (!open || open.clockOut) return res.status(404).json({ message: "No tienes turno activo" });
    if (open.breaks.some((b) => !b.end)) {
      return res.json({ record: open, recovered: true });
    }
    const record = await TimeRecord.findOneAndUpdate(
      { _id: open._id, clockOut: null, breaks: { $not: { $elemMatch: { end: null } } } },
      { $push: { breaks: { start: new Date(), end: null } } }, { new: true }
    );
    if (!record) {
      const latest = await TimeRecord.findOne(target);
      if (latest && !latest.clockOut && latest.breaks.some((b) => !b.end)) return res.json({ record: latest, recovered: true });
      return res.status(409).json({ message: "El turno cambió. Actualiza antes de iniciar el lonche." });
    }
    res.status(201).json({ record });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : "No se pudo iniciar el lonche.", err: err.message });
  }
};

export const endBreak = async (req, res) => {
  const employeeId = req.staff.id;
  const locationError = checkStaffLocation(req);
  if (locationError) return res.status(403).json({ message: locationError });
  try {
    const target = timeRecordTarget(req, employeeId);
    const open = await TimeRecord.findOne(target);
    if (!open) return res.status(404).json({ message: "No tienes turno activo" });
    const expectedStart = req.body.breakStartedAt;
    const openBreak = expectedStart
      ? open.breaks.find((b) => new Date(b.start).toISOString() === expectedStart)
      : open.breaks.find((b) => !b.end);
    if (!openBreak) return res.status(409).json({ message: "El lonche cambió. Actualiza los datos del turno." });
    if (openBreak.end) return res.json({ record: open, recovered: true });
    const record = await TimeRecord.findOneAndUpdate(
      { _id: open._id, clockOut: null, breaks: { $elemMatch: { start: openBreak.start, end: null } } },
      { $set: { "breaks.$.end": new Date() } }, { new: true }
    );
    if (!record) {
      const latest = await TimeRecord.findOne(target);
      if (latest?.breaks.some((b) => +new Date(b.start) === +new Date(openBreak.start) && b.end)) return res.json({ record: latest, recovered: true });
      return res.status(409).json({ message: "El turno cambió. Actualiza antes de terminar el lonche." });
    }
    res.json({ record });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : "No se pudo terminar el lonche.", err: err.message });
  }
};

export const getTimeRecords = async (req, res) => {
  const { locationId, date } = req.query;
  if (!locationId) return res.status(400).json({ message: "locationId requerido" });
  if (!requestedLocationIsAllowed(req, locationId)) {
    return res.status(403).json({ message: "No puedes consultar otra sucursal" });
  }
  try {
    const filter = { locationId };
    if (date) filter.date = date;
    const records = await TimeRecord.find(filter).sort({ clockIn: -1 });
    res.json({ records });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

/* PATCH /api/kiosk/time/:id  { clockIn?, clockOut?, breaks?, reason }
   Corrige un registro ya hecho -- cada quien sigue marcando su propia
   entrada/salida normalmente con clockIn/clockOut de arriba; esto es solo
   para arreglar un error (se les olvidó marcar, hora equivocada, etc.).
   Restringido a dueño únicamente (ver requireStaffAuth(["owner"]) en
   routes/kiosk.js). El motivo es obligatorio y la corrección completa
   (valor anterior y nuevo) queda en AuditLog. */
export const updateTimeRecord = async (req, res) => {
  try {
    const reason = String(req.body.reason || "").trim();
    if (!reason) return res.status(400).json({ message: "Escribe el motivo de la corrección" });

    const before = await TimeRecord.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ message: "Registro no encontrado" });

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(req.body, "clockIn")) {
      const d = new Date(req.body.clockIn);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "Hora de entrada inválida" });
      updates.clockIn = d;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "clockOut")) {
      if (req.body.clockOut === null) {
        updates.clockOut = null;
      } else {
        const d = new Date(req.body.clockOut);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "Hora de salida inválida" });
        updates.clockOut = d;
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "breaks")) {
      if (!Array.isArray(req.body.breaks)) return res.status(400).json({ message: "Lonches inválidos" });
      const cleanBreaks = [];
      for (const b of req.body.breaks) {
        const start = new Date(b?.start);
        if (Number.isNaN(start.getTime())) return res.status(400).json({ message: "Un lonche tiene hora de inicio inválida" });
        let end = null;
        if (b?.end != null) {
          end = new Date(b.end);
          if (Number.isNaN(end.getTime())) return res.status(400).json({ message: "Un lonche tiene hora de fin inválida" });
        }
        cleanBreaks.push({ start, end });
      }
      updates.breaks = cleanBreaks;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No hay ningún cambio que guardar" });
    }

    const finalClockIn = updates.clockIn ?? before.clockIn;
    const finalClockOut = updates.clockOut !== undefined ? updates.clockOut : before.clockOut;
    if (finalClockOut && new Date(finalClockOut) <= new Date(finalClockIn)) {
      return res.status(400).json({ message: "La salida debe ser después de la entrada" });
    }
    const finalBreaks = updates.breaks ?? before.breaks;
    for (const b of finalBreaks) {
      if (b.end && new Date(b.end) <= new Date(b.start)) {
        return res.status(400).json({ message: "Cada lonche debe terminar después de que empieza" });
      }
    }

    if (updates.clockOut === null) await ensureOpenShiftIndex();
    const record = await TimeRecord.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

    const changes = diffFields(
      { clockIn: before.clockIn, clockOut: before.clockOut, breaks: before.breaks },
      { clockIn: record.clockIn, clockOut: record.clockOut, breaks: record.breaks },
      Object.keys(updates)
    );
    await recordAudit({
      entity: "TimeRecord", entityId: record._id, action: "update",
      changes, ...actorFromStaff(req.staff), source: "manual", reason,
    });

    res.json({ record });
  } catch (err) {
    res.status(400).json({ message: "Error al corregir el registro", err: err.message });
  }
};

/* ── CHECKLISTS ─────────────────────────────────────────────────────────── */

export const getChecklist = async (req, res) => {
  const { locationId, date } = req.query;
  if (!locationId || !date) return res.status(400).json({ message: "locationId y date requeridos" });
  if (!requestedLocationIsAllowed(req, locationId)) {
    return res.status(403).json({ message: "No puedes consultar otra sucursal" });
  }
  try {
    const docs = await ChecklistRecord.find({ locationId, date });
    // Shape: { apertura: { "0": {by,ts}, ... }, cierre: {...}, limpieza: {...} }
    const result = {};
    for (const doc of docs) {
      result[doc.listId] = Object.fromEntries(doc.items);
    }
    res.json({ checklist: result });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const toggleChecklistItem = async (req, res) => {
  const { locationId, date, listId, idx, checked } = req.body;
  const by = req.staff.id;
  if (!locationId || !requestedLocationIsAllowed(req, locationId)) {
    return res.status(403).json({ message: "Sucursal no permitida" });
  }
  if (date !== dateKeyInTimeZone()) {
    return res.status(400).json({ message: "Solo puedes actualizar la lista del día de hoy" });
  }
  const itemCounts = { apertura: 9, cierre: 9, limpieza: 7 };
  if (!Object.hasOwn(itemCounts, listId) || !Number.isInteger(idx) || idx < 0 || idx >= itemCounts[listId] || typeof checked !== "boolean") {
    return res.status(400).json({ message: "Tarea inválida" });
  }
  try {
    const filter = { locationId, date, listId };
    const update = checked
      ? { $set: { [`items.${idx}`]: { by, ts: new Date() } } }
      : { $unset: { [`items.${idx}`]: 1 } };
    let doc;
    try {
      doc = await ChecklistRecord.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: false });
    } catch (err) {
      if (err.code !== 11000) throw err;
      doc = await ChecklistRecord.findOneAndUpdate(filter, update, { new: true });
    }
    res.json({ items: Object.fromEntries(doc.items || []) });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

/* ── TEMPERATURES ───────────────────────────────────────────────────────── */

export const addTempRecord = async (req, res) => {
  const { stationId, value, locationId } = req.body;
  const by = req.staff.id;
  if (!locationId || !requestedLocationIsAllowed(req, locationId)) {
    return res.status(403).json({ message: "Sucursal no permitida" });
  }
  if (!["refri-prot", "barra-fria", "congelador", "linea"].includes(stationId) || typeof value !== "number" || !Number.isFinite(value) || value < -100 || value > 150) {
    return res.status(400).json({ message: "Revisa la estación y escribe una temperatura válida." });
  }
  try {
    const record = await TempRecord.create({
      stationId,
      value: Number(value),
      by,
      date: dateKeyInTimeZone(),
      locationId,
      ts: new Date(),
    });
    res.status(201).json({ record });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const getTempRecords = async (req, res) => {
  const { locationId, date } = req.query;
  if (!locationId) return res.status(400).json({ message: "locationId requerido" });
  if (!requestedLocationIsAllowed(req, locationId)) {
    return res.status(403).json({ message: "No puedes consultar otra sucursal" });
  }
  try {
    const filter = { locationId };
    if (date) filter.date = date;
    const records = await TempRecord.find(filter).sort({ ts: -1 });
    res.json({ records });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

/* ── ANNOUNCEMENTS ──────────────────────────────────────────────────────── */

export const getAnnouncements = async (req, res) => {
  const { locationId } = req.query;
  if (!locationId) return res.status(400).json({ message: "locationId requerido" });
  if (!requestedLocationIsAllowed(req, locationId)) {
    return res.status(403).json({ message: "No puedes consultar otra sucursal" });
  }
  try {
    const announcements = await Announcement.find({ locationId }).sort({ createdAt: -1 });
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const createAnnouncement = async (req, res) => {
  const { text, locationId } = req.body;
  const by = req.staff.id;
  if (!locationId || !requestedLocationIsAllowed(req, locationId)) {
    return res.status(403).json({ message: "Sucursal no permitida" });
  }
  try {
    const announcement = await Announcement.create({ text, by, locationId });
    res.status(201).json({ announcement });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id).select("locationId");
    if (!announcement) return res.status(404).json({ message: "Aviso no encontrado" });
    if (!requestedLocationIsAllowed(req, announcement.locationId)) {
      return res.status(403).json({ message: "No puedes modificar otra sucursal" });
    }
    await Announcement.deleteOne({ _id: announcement._id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

/* ── SCHEDULE ───────────────────────────────────────────────────────────── */

export const getSchedule = async (req, res) => {
  const { locationId } = req.query;
  if (!locationId) return res.status(400).json({ message: "locationId requerido" });
  if (!requestedLocationIsAllowed(req, locationId)) {
    return res.status(403).json({ message: "No puedes consultar otra sucursal" });
  }
  try {
    const doc = await Schedule.findOne({ locationId });
    res.json({ schedule: doc?.schedule || {} });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const saveSchedule = async (req, res) => {
  const { locationId, schedule } = req.body;
  if (!locationId || !requestedLocationIsAllowed(req, locationId)) {
    return res.status(403).json({ message: "Sucursal no permitida" });
  }
  try {
    const doc = await Schedule.findOneAndUpdate(
      { locationId },
      { schedule },
      { upsert: true, new: true }
    );
    res.json({ schedule: doc.schedule });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};
