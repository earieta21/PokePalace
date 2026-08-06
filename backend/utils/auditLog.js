import AuditLog from "../models/AuditLog.js";

/* Registra un evento de auditoría. Nunca lanza -- una falla al escribir el
   rastro no debe tumbar la operación de negocio que la disparó. */
export async function recordAudit({
  entity, entityId, action, changes = [],
  actorId = null, actorName = "system",
  source, reason = "", locationId = null,
}) {
  try {
    if (!entity || !entityId || !action || !source) return null;
    return await AuditLog.create({ entity, entityId, action, changes, actorId, actorName, source, reason, locationId });
  } catch (err) {
    console.error("recordAudit error:", err.message);
    return null;
  }
}

// Compara solo los campos indicados y regresa los que de verdad cambiaron.
export function diffFields(before = {}, after = {}, fields = []) {
  return fields
    .filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null))
    .map((field) => ({ field, oldValue: before[field] ?? null, newValue: after[field] ?? null }));
}

export const actorFromStaff = (staff) => ({
  actorId: staff?.id || null,
  actorName: staff?.name || staff?.email || "staff",
  locationId: staff?.locationId || null,
});