export const RESTAURANT_TIME_ZONE = "America/Tijuana";

export function zonedParts(date = new Date(), timeZone = RESTAURANT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(value.year),
    month: Number(value.month),
    day: Number(value.day),
    hour: Number(value.hour),
    minute: Number(value.minute),
    second: Number(value.second),
  };
}

export function dateKeyInTimeZone(date = new Date(), timeZone = RESTAURANT_TIME_ZONE) {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function offsetAt(date, timeZone) {
  const parts = zonedParts(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function zonedDateTimeToUtc(parts, timeZone = RESTAURANT_TIME_ZONE) {
  const guess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour || 0,
    parts.minute || 0,
    parts.second || 0,
    parts.millisecond || 0
  );
  let result = new Date(guess);
  for (let pass = 0; pass < 2; pass += 1) {
    result = new Date(guess - offsetAt(result, timeZone));
  }
  return result;
}

export function startOfDateKey(dateKey, timeZone = RESTAURANT_TIME_ZONE) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
  if (!match) return null;
  const requested = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const result = zonedDateTimeToUtc(requested, timeZone);
  const actual = zonedParts(result, timeZone);
  if (
    actual.year !== requested.year ||
    actual.month !== requested.month ||
    actual.day !== requested.day ||
    actual.hour !== 0 ||
    actual.minute !== 0
  ) {
    return null;
  }
  return result;
}

export function nextDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function dayRangeInTimeZone(date = new Date(), timeZone = RESTAURANT_TIME_ZONE) {
  const key = dateKeyInTimeZone(date, timeZone);
  return {
    key,
    start: startOfDateKey(key, timeZone),
    end: startOfDateKey(nextDateKey(key), timeZone),
  };
}
