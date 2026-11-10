export const CALENDAR_KINDS = {
  task: { label: "Pendiente", plural: "Pendientes", color: "#7dd3fc" },
  absence: { label: "Ausencia", plural: "Ausencias", color: "#fda4af" },
  meeting: { label: "Reunión", plural: "Reuniones", color: "#c4b5fd" },
  maintenance: { label: "Mantenimiento", plural: "Mantenimiento", color: "#fcd34d" },
};
export const isTask = (entry) => ["task", "maintenance"].includes(entry.type);
export const isManager = (user) => ["owner", "admin", "manager"].includes(user?.role);
export const canEdit = (user, entry) => isManager(user) || String(entry.createdBy) === String(user?.id);
export const canComplete = (user, entry) => isTask(entry) && (canEdit(user, entry) || String(entry.assigneeId) === String(user?.id));
export const spansDay = (entry, day) => entry.startDate <= day && entry.endDate >= day;
export const dateFromKey = (key) => new Date(`${key}T12:00:00Z`);
export const formatDay = (key, options = { day: "numeric", month: "short" }) =>
  dateFromKey(key).toLocaleDateString("es-MX", { ...options, timeZone: "UTC" });
export const shiftDay = (key, count) => {
  const date = dateFromKey(key);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};
export function shiftMonth(month, count) {
  const date = dateFromKey(month);
  date.setUTCMonth(date.getUTCMonth() + count, 1);
  return date.toISOString().slice(0, 10);
}
export function monthDays(month) {
  const date = dateFromKey(month);
  const monday = shiftDay(month, -((date.getUTCDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => shiftDay(monday, index));
}
export function matchesCalendarFilters(entry, { type, person, search, showDone }) {
  if (type && entry.type !== type) return false;
  if (person && String(entry.assigneeId) !== person) return false;
  if (!showDone && entry.status === "done") return false;
  const normalize = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX");
  return normalize([entry.title, entry.description, entry.assigneeName].join(" ")).includes(normalize(search).trim());
}
export function absenceConflicts(entry, absences) {
  if (!isTask(entry) || entry.status === "done") return [];
  return absences.filter((absence) => absence.type === "absence"
    && String(absence.assigneeId) === String(entry.assigneeId)
    && absence.startDate <= entry.endDate && absence.endDate >= entry.startDate);
}
