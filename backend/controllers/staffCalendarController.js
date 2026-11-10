import mongoose from "mongoose";
import CalendarEntry from "../models/CalendarEntry.js";
import StaffUser from "../models/StaffUser.js";
import { dateKeyInTimeZone } from "../utils/timeZone.js";
import {
  CALENDAR_MANAGERS, calendarEntryError, calendarId, calendarRangeError,
  canCompleteCalendarEntry, canEditCalendarEntry,
} from "../utils/teamCalendar.js";

const FIELDS = ["title", "description", "type", "startDate", "endDate", "startTime", "endTime", "assigneeId", "priority", "status"];
const fail = (res, error) => {
  console.error("staffCalendar:", error.message);
  return res.status(500).json({ message: "No se pudo guardar o consultar el calendario. Intenta de nuevo." });
};

// Resolve the branch from the authenticated account; never trust a body field.
function locationFor(req, res) {
  const locationId = req.query.locationId || req.staff.locationId;
  if (typeof locationId !== "string" || !locationId.trim() || locationId.length > 100) {
    res.status(400).json({ message: "Selecciona una sucursal válida." });
    return null;
  }
  if (req.staff.locationId && req.staff.locationId !== locationId) {
    res.status(403).json({ message: "No puedes consultar el calendario de otra sucursal." });
    return null;
  }
  return locationId;
}

async function validateAssignee(staff, entry, locationId) {
  if (!mongoose.isValidObjectId(entry.assigneeId)) return { error: "Selecciona un integrante válido." };
  if (entry.type === "absence" && !CALENDAR_MANAGERS.has(staff.role)
      && calendarId(entry.assigneeId) !== calendarId(staff.id)) {
    return { error: "Solo puedes registrar tus propias ausencias.", status: 403 };
  }
  const person = await StaffUser.findOne({ _id: entry.assigneeId, active: true, locationId })
    .select("_id name").lean();
  // Owners without a branch may still use the portal in a selected branch.
  if (!person && calendarId(entry.assigneeId) === calendarId(staff.id) && !staff.locationId) {
    return { person: { _id: staff.id, name: staff.name } };
  }
  return person ? { person } : { error: "El integrante ya no está activo en esta sucursal." };
}

export async function getCalendar(req, res) {
  const locationId = locationFor(req, res);
  if (!locationId) return;
  const { from, to } = req.query;
  const error = calendarRangeError(from, to, 93);
  if (error) return res.status(400).json({ message: error });
  try {
    const [events, people, overdue] = await Promise.all([
      CalendarEntry.find({ locationId, startDate: { $lte: to }, endDate: { $gte: from } })
        .sort({ startDate: 1, startTime: 1, _id: 1 }).limit(1001).lean(),
      StaffUser.find({ locationId, active: true }).select("_id name color").sort({ name: 1 }).lean(),
      CalendarEntry.find({ locationId, type: { $in: ["task", "maintenance"] }, status: "pending",
        endDate: { $lt: dateKeyInTimeZone() } }).sort({ endDate: 1, _id: 1 }).limit(51).lean(),
    ]);
    if (!people.some((person) => calendarId(person._id) === calendarId(req.staff.id))) {
      people.push({ _id: req.staff.id, name: req.staff.name });
    }
    return res.json({ events: events.slice(0, 1000), people, overdue: overdue.slice(0, 50),
      truncated: events.length > 1000, overdueTruncated: overdue.length > 50 });
  } catch (err) { return fail(res, err); }
}

export async function createCalendarEntry(req, res) {
  const locationId = locationFor(req, res);
  if (!locationId) return;
  const clientRequestId = req.body.clientRequestId;
  if (typeof clientRequestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(clientRequestId)) {
    return res.status(400).json({ message: "Identificador de evento inválido." });
  }
  try {
    const existing = await CalendarEntry.findOne({ locationId, clientRequestId }).lean();
    if (existing) {
      if (calendarId(existing.createdBy) !== calendarId(req.staff.id)) {
        return res.status(409).json({ message: "Ese identificador ya está en uso." });
      }
      return res.json({ event: existing });
    }
    const entry = { description: "", startTime: "", endTime: "", priority: "normal", status: "pending",
      assigneeId: req.staff.id };
    for (const field of FIELDS) if (req.body[field] !== undefined) entry[field] = req.body[field];
    const error = calendarEntryError(entry);
    if (error) return res.status(400).json({ message: error });
    const { person, error: personError, status } = await validateAssignee(req.staff, entry, locationId);
    if (personError) return res.status(status || 400).json({ message: personError });
    const event = await CalendarEntry.create({ ...entry, locationId, clientRequestId,
      assigneeName: person.name, createdBy: req.staff.id, createdByName: req.staff.name,
      completedAt: entry.status === "done" ? new Date() : null });
    return res.status(201).json({ event });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "El evento ya se recibió. Actualiza el calendario antes de volver a guardarlo." });
    }
    return fail(res, err);
  }
}

export async function updateCalendarEntry(req, res) {
  const locationId = locationFor(req, res);
  if (!locationId) return;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Evento inválido." });
  if (!Number.isInteger(req.body.version) || req.body.version < 0) {
    return res.status(400).json({ message: "Actualiza el calendario antes de editar." });
  }
  try {
    const event = await CalendarEntry.findOne({ _id: req.params.id, locationId }).lean();
    if (!event) return res.status(404).json({ message: "Este evento ya no existe." });
    const fields = Object.keys(req.body).filter((field) => field !== "version");
    if (fields.length === 0 || fields.some((field) => !FIELDS.includes(field))) {
      return res.status(400).json({ message: "Cambios de evento inválidos." });
    }
    const fullEdit = canEditCalendarEntry(req.staff, event);
    if (!fullEdit && !(fields.length === 1 && fields[0] === "status" && canCompleteCalendarEntry(req.staff, event))) {
      return res.status(403).json({ message: "Solo el creador o gerencia pueden editar este evento; el responsable puede completar el pendiente." });
    }
    const next = { ...event };
    for (const field of fields) next[field] = req.body[field];
    // A completed task converted into a meeting/absence is no longer a task.
    if (fields.includes("type") && !fields.includes("status") && !["task", "maintenance"].includes(next.type)) next.status = "pending";
    const error = calendarEntryError(next);
    if (error) return res.status(400).json({ message: error });
    // Status changes must remain possible after the assignee leaves the team.
    if (fields.includes("assigneeId") || fields.includes("type")) {
      const { person, error: personError, status } = await validateAssignee(req.staff, next, locationId);
      if (personError) return res.status(status || 400).json({ message: personError });
      next.assigneeName = person.name;
    }
    const update = Object.fromEntries(FIELDS.map((field) => [field, next[field]]));
    update.title = next.title.trim();
    update.assigneeName = next.assigneeName;
    update.completedAt = next.status === "done" ? (event.completedAt || new Date()) : null;
    const saved = await CalendarEntry.findOneAndUpdate({ _id: event._id, locationId, __v: req.body.version },
      { $set: update, $inc: { __v: 1 } }, { new: true, runValidators: true });
    if (!saved) return res.status(409).json({ message: "Otra persona modificó este evento. Actualiza el calendario y vuelve a abrirlo." });
    return res.json({ event: saved });
  } catch (err) { return fail(res, err); }
}

export async function deleteCalendarEntry(req, res) {
  const locationId = locationFor(req, res);
  if (!locationId) return;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Evento inválido." });
  if (!Number.isInteger(req.body.version) || req.body.version < 0) {
    return res.status(400).json({ message: "Actualiza el calendario antes de eliminar." });
  }
  try {
    const event = await CalendarEntry.findOne({ _id: req.params.id, locationId }).lean();
    if (!event) return res.status(404).json({ message: "Este evento ya no existe." });
    if (!canEditCalendarEntry(req.staff, event)) return res.status(403).json({ message: "No puedes eliminar este evento." });
    const result = await CalendarEntry.deleteOne({ _id: event._id, locationId, __v: req.body.version });
    if (!result.deletedCount) return res.status(409).json({ message: "El evento cambió. Actualiza el calendario antes de eliminarlo." });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err); }
}
