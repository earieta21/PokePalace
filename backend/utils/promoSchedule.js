import { zonedWeekday } from "./timeZone.js";

// La promo "2x1 en Bowls" (sitio y POS) solo corre martes y jueves, hora
// Tijuana — sin importar el reloj del dispositivo del cliente o del cajero.
// zonedWeekday: 0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves...
const PROMO_2X1_WEEKDAYS = new Set([2, 4]);

export function isPromo2x1Day(date = new Date()) {
  return PROMO_2X1_WEEKDAYS.has(zonedWeekday(date));
}
