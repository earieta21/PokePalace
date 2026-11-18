import { PROMO_2X1_BOWLS_PRICE } from "../order/pricing";
import { COMBO_PALACE_PRICE } from "../data/comboPalace";

// Lo que el kiosco dice de cada promo. Qué día corre cada una lo decide el
// servidor (promo2x1Active / comboPalaceActive en AvailabilityContext), en
// hora de Tijuana; aquí solo vive el texto.
export const KIOSK_PROMOS = Object.freeze({
  promo2x1: Object.freeze({
    id: "promo2x1",
    title: "2x1 en bowls",
    deal: `2 bowls por $${PROMO_2X1_BOWLS_PRICE}`,
    terms: "Solo para comer aquí · No aplica salmón ni atún sellado",
    cta: "Armar mis 2 bowls",
  }),
  comboPalace: Object.freeze({
    id: "comboPalace",
    title: "Combo Palace",
    deal: `Bowl + bebida + Rice Cake por $${COMBO_PALACE_PRICE}`,
    terms: "Elige cualquiera de los bowls de la casa",
    cta: "Elegir mi combo",
  }),
});

// null mientras carga la disponibilidad: no se enseña nada hasta saberlo,
// para no anunciar un instante una promo que hoy no corre.
export const activeKioskPromos = ({ promo2x1Active, comboPalaceActive }) => [
  promo2x1Active === true && KIOSK_PROMOS.promo2x1,
  comboPalaceActive === true && KIOSK_PROMOS.comboPalace,
].filter(Boolean);

const DAY_NAMES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const listDays = (days) => {
  const names = (Array.isArray(days) ? days : [])
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .map((day) => DAY_NAMES[day]);
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
};

const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : "");

// "Lun, mié y vie: Combo Palace · Mar y jue: 2x1 en bowls". Vacío si el
// servidor todavía no manda los días.
export function promoScheduleText(promoWeekdays) {
  if (!promoWeekdays) return "";
  return [
    [promoWeekdays.comboPalace, KIOSK_PROMOS.comboPalace.title],
    [promoWeekdays.promo2x1, KIOSK_PROMOS.promo2x1.title],
  ]
    .map(([days, title]) => {
      const text = listDays(days);
      return text ? `${capitalize(text)}: ${title}` : "";
    })
    .filter(Boolean)
    .join(" · ");
}
