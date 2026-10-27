/* Freno de PIN por sucursal, además del límite por IP de routes/staffAuth.js.
   El límite por IP no sirve contra alguien que reparte intentos entre muchas
   IPs; este cuenta todos los PIN fallidos de la sucursal sin importar de
   dónde vengan. Al llegar al tope, el acceso con PIN se pausa hasta que los
   fallos más viejos salgan de la ventana (Face ID sigue funcionando) y se
   avisa al dueño por Telegram. */
import StaffLoginEvent from "../models/StaffLoginEvent.js";
import { sendTelegramMessage } from "./telegramFinanceBot.js";

export const PIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const PIN_LOCKOUT_MAX_FAILURES = 20;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

// Nunca lanza: una falla al escribir la bitácora no debe impedir entrar.
export async function recordLoginEvent(req, { type, method, locationId = null, user = null }) {
  try {
    await StaffLoginEvent.create({
      type,
      method,
      locationId,
      staffId: user?._id || null,
      staffName: user?.name || "",
      ip: req.ip || "",
      userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
    });
  } catch (err) {
    console.error("recordLoginEvent error:", err.message);
  }
}

const recentPinFailures = (locationId, since) =>
  StaffLoginEvent.countDocuments({ locationId, method: "pin", type: "failed", createdAt: { $gte: since } });

export async function isPinLoginLocked(locationId) {
  const since = new Date(Date.now() - PIN_LOCKOUT_WINDOW_MS);
  return (await recentPinFailures(locationId, since)) >= PIN_LOCKOUT_MAX_FAILURES;
}

export async function recordPinFailure(req, locationId) {
  await recordLoginEvent(req, { type: "failed", method: "pin", locationId });
  try {
    const now = Date.now();
    const since = new Date(now - PIN_LOCKOUT_WINDOW_MS);
    const failures = await recentPinFailures(locationId, since);
    if (failures < PIN_LOCKOUT_MAX_FAILURES) return;

    const alertedRecently = await StaffLoginEvent.exists({
      locationId,
      type: "locked",
      createdAt: { $gte: new Date(now - ALERT_COOLDOWN_MS) },
    });
    await recordLoginEvent(req, { type: "locked", method: "pin", locationId });
    if (!alertedRecently) {
      const ips = await StaffLoginEvent.distinct("ip", { locationId, type: "failed", createdAt: { $gte: since } });
      alertOwner(locationId, failures, ips);
    }
  } catch (err) {
    console.error("recordPinFailure error:", err.message);
  }
}

function alertOwner(locationId, failures, ips) {
  const chatId = process.env.TELEGRAM_SECURITY_CHAT_ID || process.env.TELEGRAM_FISCAL_CHAT_ID;
  if (!chatId || !process.env.TELEGRAM_FINANCE_BOT_TOKEN) return;
  const ipList = ips.filter(Boolean);
  const text = [
    `⚠️ Poke Palace: ${failures} PIN incorrectos en 15 minutos en el portal del staff (${locationId}).`,
    "El acceso con PIN quedó pausado unos minutos; Face ID sigue funcionando.",
    ipList.length ? `Desde ${ipList.length} IP(s): ${ipList.slice(0, 5).join(", ")}${ipList.length > 5 ? "…" : ""}` : "",
    "Si no fue alguien del equipo, alguien está intentando adivinar los PIN.",
  ].filter(Boolean).join("\n");
  sendTelegramMessage(chatId, text); // no se espera: sendTelegramMessage nunca lanza
}
