import { zonedWeekday } from "./timeZone.js";

// La promo "2x1 en Bowls" (sitio y POS) solo corre martes y jueves, hora
// Tijuana — sin importar el reloj del dispositivo del cliente o del cajero.
// zonedWeekday: 0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves...
const PROMO_2X1_WEEKDAYS = new Set([2, 4]);

export function isPromo2x1Day(date = new Date()) {
  return PROMO_2X1_WEEKDAYS.has(zonedWeekday(date));
}

// El Combo Palace corre lunes, miércoles y viernes — se alterna con el 2x1
// para que cada día de la semana tenga a lo más una promo corriendo.
const COMBO_PALACE_WEEKDAYS = new Set([1, 3, 5]);

export function isComboPalaceDay(date = new Date()) {
  return COMBO_PALACE_WEEKDAYS.has(zonedWeekday(date));
}
