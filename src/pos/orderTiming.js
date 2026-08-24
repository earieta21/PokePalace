const RESTAURANT_TIME_ZONE = "America/Tijuana";

const pickupTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  timeZone: RESTAURANT_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

export function elapsedOrderTime(createdAt, now = Date.now()) {
  const createdTime = new Date(createdAt).getTime();
  const currentTime = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(createdTime) || !Number.isFinite(currentTime)) return "—";

  const seconds = Math.max(0, Math.floor((currentTime - createdTime) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function orderTimingLabel(order, now = Date.now()) {
  if (!order?.scheduledPickupTime) return elapsedOrderTime(order?.createdAt, now);

  const pickupTime = new Date(order.scheduledPickupTime);
  if (Number.isNaN(pickupTime.getTime())) return elapsedOrderTime(order?.createdAt, now);

  return `Programado ${pickupTimeFormatter.format(pickupTime)}`;
}

