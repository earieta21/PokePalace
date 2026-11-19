import { PICKUP_LEAD_MINUTES, RESTAURANT_CLOSE_HOUR, restaurantOpenHour, isWithinRestaurantHours, scheduledPickupProblem } from "../../backend/utils/pickupSchedule.js";
import { dateKeyInTimeZone, nextDateKey, zonedDateTimeToUtc, zonedParts } from "../../backend/utils/timeZone.js";

const pad = (value) => String(value).padStart(2, "0");

// datetime-local contains a wall-clock time with no offset. Interpret it in
// Tijuana even when the customer is ordering from a different time zone.
function parsePickupTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const parts = { year, month, day, hour, minute };
  const date = zonedDateTimeToUtc(parts);
  const actual = zonedParts(date);
  return Object.keys(parts).every((key) => parts[key] === actual[key]) ? date : null;
}

export function getPickupOptions(order, now = new Date()) {
  const open = isWithinRestaurantHours(now);
  const todayKey = dateKeyInTimeZone(now);
  // Pick a whole minute that will still meet the lead time when submitted.
  const candidate = new Date((Math.floor(now.getTime() / 60_000) + PICKUP_LEAD_MINUTES + 1) * 60_000);
  const { hour, minute } = zonedParts(candidate);
  let dateKey = dateKeyInTimeZone(candidate);
  const opening = restaurantOpenHour(candidate);
  let time = `${pad(hour)}:${pad(minute)}`;
  if (hour < opening || hour >= RESTAURANT_CLOSE_HOUR) {
    if (hour >= RESTAURANT_CLOSE_HOUR) dateKey = nextDateKey(dateKey);
    time = `${pad(opening)}:00`;
  }
  const min = `${dateKey}T${time}`;
  const max = `${nextDateKey(todayKey)}T${pad(RESTAURANT_CLOSE_HOUR - 1)}:59`;
  const forPickup = order.fulfillment !== "dine_in";
  const needsTime = forPickup && (!open || order.isScheduled);
  const value = order.isScheduled ? order.scheduledPickupTime : min;
  const scheduled = needsTime ? parsePickupTime(value) : null;
  let errorKey = null;
  if (!forPickup && !open) errorKey = "summary.closedDineIn";
  if (needsTime && (!scheduled || value > max || scheduledPickupProblem(scheduled, now))) {
    errorKey = value ? "summary.invalidPickupTime" : "summary.missingSchedule";
  }
  return {
    open, min, max, time, today: dateKey === todayKey, errorKey,
    scheduledAt: scheduled && !errorKey ? scheduled.toISOString() : null,
  };
}
