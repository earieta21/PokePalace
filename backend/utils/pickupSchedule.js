import { zonedParts } from "./timeZone.js";

export const RESTAURANT_OPEN_HOUR = 11;
export const RESTAURANT_CLOSE_HOUR = 21;
export const PICKUP_LEAD_MINUTES = 15;

export function restaurantOpenHour() {
  return RESTAURANT_OPEN_HOUR;
}

export function isWithinRestaurantHours(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const { hour } = zonedParts(date);
  return hour >= restaurantOpenHour(date) && hour < RESTAURANT_CLOSE_HOUR;
}

export function scheduledPickupProblem(date, now = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "invalid";
  if (date.getTime() < now.getTime() + PICKUP_LEAD_MINUTES * 60_000) return "tooSoon";
  return isWithinRestaurantHours(date) ? null : "closed";
}
