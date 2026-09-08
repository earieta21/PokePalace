import Expense from "../models/Expense.js";
import FixedExpense from "../models/FixedExpense.js";
import { zonedParts } from "./timeZone.js";

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export const periodKeyOf = (year, month) => `${year}-${String(month).padStart(2, "0")}`;

// El día real en que toca este mes: si se configuró 31 y el mes tiene 30, se
// anota el último día del mes en vez de saltarse el mes entero.
export const dueDayOf = (fixed, year, month) =>
  Math.min(fixed.dayOfMonth, daysInMonth(year, month));

/* Anota en Finanzas los gastos fijos cuyo día del mes ya llegó y que todavía
   no se han anotado este mes.

   La idempotencia no depende de que esto corra una sola vez: `sourceRef` es
   único en Expense, así que aunque el servidor reinicie, corra en paralelo o
   revise cada hora, un mismo gasto fijo solo puede quedar una vez por mes.

   Solo mira el mes en curso a propósito. Si el servidor estuviera caído un mes
   completo, ese mes se captura a mano -- preferible a que al volver aparezcan
   gastos viejos de golpe sin que nadie los espere. */
export async function registerDueFixedExpenses(now = new Date()) {
  const { year, month, day } = zonedParts(now);
  const period = periodKeyOf(year, month);
  const created = [];

  const actives = await FixedExpense.find({ active: true }).lean();
  for (const fixed of actives) {
    const dueDay = dueDayOf(fixed, year, month);
    if (day < dueDay) continue;
    if (fixed.amount <= 0) continue;

    try {
      const expense = await Expense.create({
        category: fixed.category,
        description: fixed.name,
        amount: fixed.amount,
        date: `${period}-${String(dueDay).padStart(2, "0")}`,
        locationId: fixed.locationId,
        createdBy: "Gasto fijo automático",
        source: "fijo",
        sourceRef: `fixed:${fixed._id}:${period}`,
      });
      created.push(expense);
    } catch (err) {
      // E11000 = ya se había anotado este mes. Cualquier otra falla se reporta
      // pero no debe frenar a los demás gastos fijos de la lista.
      if (err?.code !== 11000) {
        console.error(`registerDueFixedExpenses (${fixed.name}):`, err.message);
      }
    }
  }

  return created;
}
