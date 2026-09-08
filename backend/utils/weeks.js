import { zonedParts, zonedDateTimeToUtc, dateKeyInTimeZone, nextDateKey } from "./timeZone.js";

/* Definición única de "semana" del negocio: lunes 00:00 a domingo 23:59, hora
   Tijuana. La comparten el Resumen semanal y la nómina — si cada uno la
   calculara por su cuenta, los números de una misma semana podrían no cuadrar.

   Las fechas se guardan en UTC y se agrupan con America/Tijuana para respetar
   tanto el día local como los cambios estacionales de huso horario. */
export const toTijuana = (date) => {
  const parts = zonedParts(date);
  return new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  ));
};

export const fromTijuana = (date) => zonedDateTimeToUtc({
  year: date.getUTCFullYear(),
  month: date.getUTCMonth() + 1,
  day: date.getUTCDate(),
  hour: date.getUTCHours(),
  minute: date.getUTCMinutes(),
  second: date.getUTCSeconds(),
});

// Lunes 00:00 (hora Tijuana) de la semana que contiene `date`, como instante UTC.
export function mondayOf(date) {
  const tj = toTijuana(date);
  const monday = new Date(Date.UTC(tj.getUTCFullYear(), tj.getUTCMonth(), tj.getUTCDate()));
  const day = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (day === 0 ? 6 : day - 1));
  return fromTijuana(monday);
}

/* Límite superior exclusivo (el lunes siguiente). Se vuelve a anclar con
   mondayOf en vez de confiar en que la semana dure exactamente 168 h: en el
   cambio de horario de verano dura 167 o 169. */
export const weekEndOf = (monday) => mondayOf(new Date(monday.getTime() + 7 * 86400000));

/* Domingo de esa semana, como date-key. Se cuenta por días de calendario y no
   sumando 6 × 24 h por la misma razón: en la semana del cambio de horario, la
   suma en milisegundos cae en el día equivocado. */
export function weekEndKeyOf(monday) {
  let key = dateKeyInTimeZone(monday);
  for (let i = 0; i < 6; i += 1) key = nextDateKey(key);
  return key;
}
