export function dateKeyInTimeZone(date = new Date(), timeZone = "America/Tijuana") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export const tijuanaDateKey = (date = new Date()) =>
  dateKeyInTimeZone(date, "America/Tijuana");
