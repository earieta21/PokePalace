/* Recordatorio fiscal automático — unos días antes del 17 (fecha límite de
   la declaración RESICO) manda por Telegram el paquete del mes que toca
   declarar, sin que nadie tenga que entrar a la pestaña Fiscal a revisar.
   Reutiliza el mismo bot de Telegram que la captura de facturas
   (TELEGRAM_FINANCE_BOT_TOKEN) -- un solo bot, dos capacidades. */
import StoreSettings from "../models/StoreSettings.js";
import { computeFiscalSummary } from "../services/fiscalCalc.js";
import { sendTelegramMessage, financeBotConfigured } from "./telegramFinanceBot.js";
import { dateKeyInTimeZone } from "./timeZone.js";

// Empieza a avisar 5 días antes del 17 -- si ese día el servidor estuvo
// caído o Telegram falló, los checks de los días siguientes lo reintentan
// (registerDueFixedExpenses.js usa el mismo patrón de "revisar seguido,
// idempotente por fecha").
const REMIND_FROM_DAYS_BEFORE = 5;

function fmtMXN(n) {
  return `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MES_LABEL = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function buildMessage(summary) {
  const [dataYear, dataMonth] = summary.month.split("-").map(Number);
  const [, dueMonth] = summary.vencimiento.split("-").map(Number);
  return `📋 Recordatorio fiscal — declaración de ${MES_LABEL[dataMonth]} ${dataYear}

Vence el 17 de ${MES_LABEL[dueMonth]}.

Ingresos cobrados: ${fmtMXN(summary.ingresos.conIva)} (${summary.ordenesCobradas} órdenes)
IVA cobrado (16%): ${fmtMXN(summary.ingresos.ivaTrasladado)}
ISR estimado (${(summary.isr.tasa * 100).toFixed(1)}%): ${fmtMXN(summary.isr.estimado)}
Estimado a pagar: ${fmtMXN(summary.totalEstimado)}

Gastos registrados: ${fmtMXN(summary.gastos.total)} (${summary.gastos.movimientos} movimientos)

Esto es una estimación de la app — pásaselo a tu contador para que revise y presente antes del 17. Ver el detalle completo en la pestaña Fiscal del portal.`;
}

/* Corre en un scheduler (ver startFiscalReminderScheduler en server.js).
   Idempotente: usa StoreSettings.lastFiscalReminderSentFor para no mandar
   el mismo recordatorio dos veces, aunque se llame varias veces al día. */
export async function checkAndSendFiscalReminder() {
  const chatId = process.env.TELEGRAM_FISCAL_CHAT_ID;
  if (!chatId || !financeBotConfigured()) return null;

  const todayKey = dateKeyInTimeZone();
  const [todayYear, todayMonth, todayDay] = todayKey.split("-").map(Number);

  const dueDateStr = `${todayYear}-${String(todayMonth).padStart(2, "0")}-17`;
  const dueDateUtc = Date.UTC(todayYear, todayMonth - 1, 17);
  const todayUtc = Date.UTC(todayYear, todayMonth - 1, todayDay);
  const daysUntilDue = Math.round((dueDateUtc - todayUtc) / 86400000);

  if (daysUntilDue < 0 || daysUntilDue > REMIND_FROM_DAYS_BEFORE) return null;

  const settings = await StoreSettings.findOne({ key: "main" }).select("lastFiscalReminderSentFor");
  if (settings?.lastFiscalReminderSentFor === dueDateStr) return null;

  // El 17 de este mes declara los datos del mes ANTERIOR.
  const dataMonth = todayMonth === 1 ? 12 : todayMonth - 1;
  const dataYear = todayMonth === 1 ? todayYear - 1 : todayYear;

  const summary = await computeFiscalSummary(dataYear, dataMonth);
  await sendTelegramMessage(chatId, buildMessage(summary));

  await StoreSettings.findOneAndUpdate(
    { key: "main" },
    { lastFiscalReminderSentFor: dueDateStr },
    { upsert: true, setDefaultsOnInsert: true }
  );

  return { dueDateStr, sentFor: summary.month };
}
