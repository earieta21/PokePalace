export const CALENDAR_TYPES = ["task", "absence", "meeting", "maintenance"];
export const CALENDAR_MANAGERS = new Set(["manager", "admin", "owner"]);
export const isCalendarTask = (type) => type === "task" || type === "maintenance";
export const calendarId = (value) => String(value?._id || value || "");

export function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && value >= "2000-01-01" && value <= "2100-12-31";
}

export function calendarRangeError(from, to, maxDays = 370) {
  if (!isCalendarDate(from) || !isCalendarDate(to)) return "Escribe fechas válidas.";
  if (to < from) return "La fecha final debe ser igual o posterior a la inicial.";
  if ((Date.parse(to) - Date.parse(from)) / 86400000 >= maxDays) {
    return `El periodo debe ser menor a ${maxDays} días.`;
  }
  return null;
}

export function calendarEntryError(entry) {
  if (typeof entry.title !== "string" || !entry.title.trim() || entry.title.trim().length > 120) {
    return "El título debe tener entre 1 y 120 caracteres.";
  }
  if (typeof entry.description !== "string" || entry.description.length > 2000) {
    return "La descripción admite hasta 2000 caracteres.";
  }
  if (!CALENDAR_TYPES.includes(entry.type)) return "Tipo de evento inválido.";
  const rangeError = calendarRangeError(entry.startDate, entry.endDate);
  if (rangeError) return rangeError;
  if (!["normal", "high"].includes(entry.priority)) return "Prioridad inválida.";
  if (!["pending", "done"].includes(entry.status)) return "Estado inválido.";
  if (!isCalendarTask(entry.type) && entry.status !== "pending") return "Este evento no es un pendiente.";
  for (const time of [entry.startTime, entry.endTime]) {
    if (typeof time !== "string" || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      return "Escribe una hora válida.";
    }
  }
  if (entry.type === "absence" && (entry.startTime || entry.endTime)) return "Las ausencias se registran por día completo.";
  if (entry.endTime && !entry.startTime) return "Indica la hora inicial.";
  if (entry.startDate === entry.endDate && entry.endTime && entry.endTime <= entry.startTime) {
    return "La hora final debe ser posterior a la inicial.";
  }
  return null;
}

export const canEditCalendarEntry = (staff, entry) =>
  CALENDAR_MANAGERS.has(staff.role) || calendarId(entry.createdBy) === calendarId(staff.id);

export const canCompleteCalendarEntry = (staff, entry) =>
  isCalendarTask(entry.type) && (canEditCalendarEntry(staff, entry)
    || calendarId(entry.assigneeId) === calendarId(staff.id));
