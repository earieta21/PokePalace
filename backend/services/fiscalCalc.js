/* Cálculo puro del paquete fiscal del mes — usado tanto por el endpoint
   GET /api/staff/fiscal (fiscalController.js) como por el recordatorio
   automático (utils/fiscalReminder.js), para que ambos siempre calculen
   exactamente lo mismo. Calibrado al régimen real del dueño: persona
   física en RESICO, "Restaurantes de comida para llevar". */
import Order from "../models/Order.js";
import Expense from "../models/Expense.js";
import { zonedDateTimeToUtc, dateKeyInTimeZone } from "../utils/timeZone.js";

const IVA_RATE = 0.16;

// Tabla de ISR mensual RESICO personas físicas (LISR art. 113-E) —
// tasa sobre ingresos efectivamente cobrados SIN IVA.
const RESICO_BRACKETS = [
  { upTo: 25000.0,   rate: 0.01  },
  { upTo: 50000.0,   rate: 0.011 },
  { upTo: 83333.33,  rate: 0.015 },
  { upTo: 208333.33, rate: 0.02  },
  { upTo: Infinity,  rate: 0.025 },
];

const round2 = (n) => Math.round(n * 100) / 100;

const resicoRate = (monthlyBase) =>
  RESICO_BRACKETS.find((bracket) => monthlyBase <= bracket.upTo).rate;

export async function computeFiscalSummary(year, month) {
  const start = zonedDateTimeToUtc({ year, month, day: 1 });
  const end = month === 12
    ? zonedDateTimeToUtc({ year: year + 1, month: 1, day: 1 })
    : zonedDateTimeToUtc({ year, month: month + 1, day: 1 });

  const [orders, expenses] = await Promise.all([
    Order.find({
      createdAt: { $gte: start, $lt: end },
      status: { $ne: "cancelled" },
      paymentStatus: "paid",
      total: { $ne: null },
    }).lean(),
    Expense.find({
      date: { $gte: dateKeyInTimeZone(start), $lt: dateKeyInTimeZone(end) },
    }).lean(),
  ]);

  const ingresosConIva = orders.reduce((sum, order) => sum + order.total, 0);
  const base = ingresosConIva / (1 + IVA_RATE);
  const ivaTrasladado = ingresosConIva - base;
  const rate = resicoRate(base);
  const isrEstimado = base * rate;

  const porMetodo = {};
  for (const order of orders) {
    const key = order.paymentMethod || "pay_at_pickup";
    porMetodo[key] = round2((porMetodo[key] || 0) + order.total);
  }

  const gastosTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  // Vencimiento: día 17 del mes siguiente
  const dueMonth = month === 12 ? 1 : month + 1;
  const dueYear = month === 12 ? year + 1 : year;

  return {
    regimen: "RESICO (Régimen Simplificado de Confianza) — persona física",
    month: `${year}-${String(month).padStart(2, "0")}`,
    ordenesCobradas: orders.length,
    ingresos: {
      conIva: round2(ingresosConIva),
      base: round2(base),
      ivaTrasladado: round2(ivaTrasladado),
      porMetodo,
    },
    isr: {
      tasa: rate,
      estimado: round2(isrEstimado),
    },
    // Sin acreditar IVA de compras (requiere facturas CFDI): estimación conservadora.
    ivaEstimado: round2(ivaTrasladado),
    totalEstimado: round2(isrEstimado + ivaTrasladado),
    gastos: {
      total: round2(gastosTotal),
      movimientos: expenses.length,
    },
    vencimiento: `${dueYear}-${String(dueMonth).padStart(2, "0")}-17`,
    notas: [
      "El ISR en RESICO se calcula sobre ingresos cobrados sin IVA; los gastos NO lo reducen.",
      "El IVA estimado es el cobrado; las facturas (CFDI) de compras con IVA pueden reducirlo. Pide factura con tu RFC a cada proveedor.",
      "Estimación informativa: la declaración la debe revisar/presentar tu contador antes del día 17.",
    ],
  };
}
