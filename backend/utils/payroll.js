import StaffUser from "../models/StaffUser.js";
import TimeRecord from "../models/TimeRecord.js";
import { dateKeyInTimeZone } from "./timeZone.js";
import { mondayOf, weekEndOf, weekEndKeyOf } from "./weeks.js";

/* Misma fórmula que muestra el portal (PayrollView en UnifiedStaffApp.jsx):
   sueldo semanal fijo tal cual, o horas netas × sueldo por hora. Se calcula
   también aquí porque Finanzas necesita un monto que el servidor pueda
   defender, no uno que venga del navegador. */
export const payForEmployee = (employee, minutes) =>
  employee.payType === "weekly"
    ? (employee.weeklySalary || 0)
    : (minutes / 60) * (employee.hourlyRate || 0);

// Minutos pagados de un turno: bruto menos lonches.
const paidMinutes = (record) => {
  const start = new Date(record.clockIn).getTime();
  const end = new Date(record.clockOut).getTime();
  const breakMins = (record.breaks || []).reduce((sum, b) => {
    if (!b?.start || !b?.end) return sum;
    return sum + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000;
  }, 0);
  return Math.max(0, (end - start) / 60000 - breakMins);
};

/* Nómina de una semana ya cerrada (lunes a domingo, hora Tijuana).

   Un turno sin salida en una semana cerrada es una checada olvidada, no un
   turno de días: se cuenta como 0 minutos y se reporta en `warnings` para que
   quien registre el gasto corrija el monto a mano en vez de que el sistema
   invente horas. */
export async function computeWeeklyPayroll(weekStartDate, { locationId } = {}) {
  const weekFrom = mondayOf(weekStartDate);
  const weekTo = weekEndOf(weekFrom);
  const scope = locationId ? { locationId } : {};

  const records = await TimeRecord.find({
    clockIn: { $gte: weekFrom, $lt: weekTo },
    ...scope,
  }).lean();

  // Activos hoy, más quien haya trabajado esa semana aunque después se diera
  // de baja: sus horas se pagaron igual. Sin esa segunda condición, dar de
  // baja a alguien borraría su pago de una semana ya trabajada.
  const workedIds = [...new Set(records.map((record) => String(record.employeeId)))];
  const employees = await StaffUser.find({
    ...scope,
    $or: [{ active: true }, { _id: { $in: workedIds } }],
  })
    .select("name role payType hourlyRate weeklySalary")
    .lean();

  const warnings = [];
  const minutesByEmployee = new Map();
  for (const record of records) {
    const key = String(record.employeeId);
    if (!record.clockOut) {
      const name = employees.find((e) => String(e._id) === key)?.name || "Un empleado";
      warnings.push(`${name} tiene un turno sin salida el ${record.date} — esas horas no se contaron.`);
      continue;
    }
    minutesByEmployee.set(key, (minutesByEmployee.get(key) || 0) + paidMinutes(record));
  }

  const rows = employees
    .map((employee) => {
      const minutes = minutesByEmployee.get(String(employee._id)) || 0;
      return {
        employeeId: String(employee._id),
        name: employee.name,
        role: employee.role,
        payType: employee.payType,
        hours: parseFloat((minutes / 60).toFixed(2)),
        pay: parseFloat(payForEmployee(employee, minutes).toFixed(2)),
      };
    })
    .sort((a, b) => b.pay - a.pay);

  return {
    weekStart: dateKeyInTimeZone(weekFrom),
    weekEnd: weekEndKeyOf(weekFrom),
    employees: rows,
    total: parseFloat(rows.reduce((sum, row) => sum + row.pay, 0).toFixed(2)),
    warnings,
  };
}
