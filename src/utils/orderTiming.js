import { RESTAURANT_TIME_ZONE } from "../../backend/utils/timeZone.js";

export function getOrderTiming(order, language = "es") {
  if (order?.status !== "pending" && order?.status !== "preparing") return null;

  const scheduled = Boolean(order.scheduledPickupTime);
  const value = scheduled ? order.scheduledPickupTime : order.estimatedReadyAt;
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const es = language === "es";
  let label = es ? "Recogida estimada" : "Estimated pickup";
  if (scheduled) label = es ? "Recogida programada" : "Scheduled pickup";
  else if (order.fulfillment === "dine_in") label = es ? "Hora estimada de preparación" : "Estimated ready time";

  const time = date.toLocaleString(es ? "es-MX" : "en-US", {
    timeZone: RESTAURANT_TIME_ZONE,
    ...(scheduled ? { weekday: "short", month: "short", day: "numeric" } : {}),
    hourCycle: es ? "h23" : "h12",
    hour: "numeric",
    minute: "2-digit",
  });
  return { label, time, dateTime: date.toISOString() };
}
