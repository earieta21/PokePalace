import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import TimeRecord from "../models/TimeRecord.js";
import ChecklistRecord from "../models/ChecklistRecord.js";
import TempRecord from "../models/TempRecord.js";
import Announcement from "../models/Announcement.js";
import Schedule from "../models/Schedule.js";
import StaffUser from "../models/StaffUser.js";
import { comparePin, hashPin, isValidPin } from "../utils/staffPin.js";
import { isWithinRestaurant, MAX_DISTANCE_METERS } from "../utils/geo.js";

const LOCATION_ERROR_MSG = `Debes estar en el restaurante para marcar tu entrada/salida (dentro de ${MAX_DISTANCE_METERS}m).`;

// Valida que el body traiga coordenadas y que estén dentro del radio del
// local. Devuelve un mensaje de error si algo falla, o null si está bien.
function checkStaffLocation(req) {
  const { lat, lng } = req.body || {};
  if (typeof lat !== "number" || typeof lng !== "number") {
    return "No se pudo obtener tu ubicación. Activa el permiso de ubicación e intenta de nuevo.";
  }
  if (!isWithinRestaurant(lat, lng)) {
    return LOCATION_ERROR_MSG;
  }
  return null;
}

/* ── EMPLOYEES ──────────────────────────────────────────────────────────── */

export const getKioskEmployees = async (req, res) => {
  const { locationId } = req.query;
  if (!locationId) return res.status(400).json({ message: "locationId requerido" });
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
  try {
    const employees = await StaffUser.find({ locationId, active: true })
      .select("_id name role color locationId active hourlyRate")
      .sort({ name: 1 });
    res.json({ employees });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const createKioskEmployee = async (req, res) => {
  const { name, role, pin, color, locationId, hourlyRate } = req.body;
  if (!name?.trim() || !isValidPin(pin) || !locationId) {
    return res.status(400).json({ message: "Nombre y PIN de 4 dígitos requeridos" });
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
      role: role || "employee",
      pin: await hashPin(pin),
      color: color || "emerald",
      email,
      password,
      locationId,
      active: true,
      hourlyRate: hourlyRate ? parseFloat(hourlyRate) : 0,
    });

    res.status(201).json({
      employee: {
        _id: employee._id, name: employee.name,
        role: employee.role, color: employee.color,
        locationId: employee.locationId, hourlyRate: employee.hourlyRate,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Error creando empleado", err: err.message });
  }
};

export const updateKioskEmployee = async (req, res) => {
  try {
    const allowed = ["name", "hourlyRate", "color", "role"];
    const update  = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    if (update.hourlyRate !== undefined) update.hourlyRate = parseFloat(update.hourlyRate) || 0;
    if (update.name !== undefined) {
      update.name = String(update.name).trim();
      if (!update.name) delete update.name;
    }

    const employee = await StaffUser.findByIdAndUpdate(req.params.id, update, { new: true })
      .select("_id name role color locationId active hourlyRate");
    if (!employee) return res.status(404).json({ message: "Empleado no encontrado" });
    res.json({ employee });
  } catch (err) {
    res.status(500).json({ message: "Error actualizando empleado", err: err.message });
  }
};

export const removeKioskEmployee = async (req, res) => {
  try {
    await StaffUser.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

/* ── TIME RECORDS ───────────────────────────────────────────────────────── */

export const clockIn = async (req, res) => {
  const { locationId, date } = req.body;
  const employeeId = req.staff.id;
  const locationError = checkStaffLocation(req);
  if (locationError) return res.status(403).json({ message: locationError });
  try {
    const existing = await TimeRecord.findOne({ employeeId, clockOut: null, locationId });
    if (existing) return res.status(409).json({ message: "Ya tienes turno activo" });
    const record = await TimeRecord.create({ employeeId, clockIn: new Date(), date, locationId });
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
    const open = await TimeRecord.findOne({ employeeId, clockOut: null });
    if (!open) return res.status(404).json({ message: "No hay turno activo" });
    const openBreak = open.breaks.find((b) => !b.end);
    if (openBreak) {
      return res.status(400).json({ message: "Termina tu lonche antes de marcar salida" });
    }
    open.clockOut = new Date();
    await open.save();
    res.json({ record: open });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

/* ── LONCHE (break) ─────────────────────────────────────────────────────── */

export const startBreak = async (req, res) => {
  const employeeId = req.staff.id;
  const locationError = checkStaffLocation(req);
  if (locationError) return res.status(403).json({ message: locationError });
  try {
    const open = await TimeRecord.findOne({ employeeId, clockOut: null });
    if (!open) return res.status(404).json({ message: "No tienes turno activo" });
    if (open.breaks.some((b) => !b.end)) {
      return res.status(409).json({ message: "Ya tienes un lonche en curso" });
    }
    open.breaks.push({ start: new Date() });
    await open.save();
    res.status(201).json({ record: open });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const endBreak = async (req, res) => {
  const employeeId = req.staff.id;
  const locationError = checkStaffLocation(req);
  if (locationError) return res.status(403).json({ message: locationError });
  try {
    const open = await TimeRecord.findOne({ employeeId, clockOut: null });
    if (!open) return res.status(404).json({ message: "No tienes turno activo" });
    const openBreak = open.breaks.find((b) => !b.end);
    if (!openBreak) return res.status(404).json({ message: "No tienes un lonche en curso" });
    openBreak.end = new Date();
    await open.save();
    res.json({ record: open });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const getTimeRecords = async (req, res) => {
  const { locationId, date } = req.query;
  if (!locationId) return res.status(400).json({ message: "locationId requerido" });
  try {
    const filter = { locationId };
    if (date) filter.date = date;
    const records = await TimeRecord.find(filter).sort({ clockIn: -1 });
    res.json({ records });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

/* ── CHECKLISTS ─────────────────────────────────────────────────────────── */

export const getChecklist = async (req, res) => {
  const { locationId, date } = req.query;
  if (!locationId || !date) return res.status(400).json({ message: "locationId y date requeridos" });
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
  try {
    const doc = await ChecklistRecord.findOneAndUpdate(
      { locationId, date, listId },
      {},
      { upsert: true, new: true }
    );
    if (checked) {
      doc.items.set(String(idx), { by, ts: new Date() });
    } else {
      doc.items.delete(String(idx));
    }
    await doc.save();
    res.json({ items: Object.fromEntries(doc.items) });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

/* ── TEMPERATURES ───────────────────────────────────────────────────────── */

export const addTempRecord = async (req, res) => {
  const { stationId, value, date, locationId } = req.body;
  const by = req.staff.id;
  try {
    const record = await TempRecord.create({ stationId, value: Number(value), by, date, locationId, ts: new Date() });
    res.status(201).json({ record });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const getTempRecords = async (req, res) => {
  const { locationId, date } = req.query;
  if (!locationId) return res.status(400).json({ message: "locationId requerido" });
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
  try {
    const announcement = await Announcement.create({ text, by, locationId });
    res.status(201).json({ announcement });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const deleteAnnouncement = async (req, res) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

/* ── SCHEDULE ───────────────────────────────────────────────────────────── */

export const getSchedule = async (req, res) => {
  const { locationId } = req.query;
  if (!locationId) return res.status(400).json({ message: "locationId requerido" });
  try {
    const doc = await Schedule.findOne({ locationId });
    res.json({ schedule: doc?.schedule || {} });
  } catch (err) {
    res.status(500).json({ message: "Error", err: err.message });
  }
};

export const saveSchedule = async (req, res) => {
  const { locationId, schedule } = req.body;
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
