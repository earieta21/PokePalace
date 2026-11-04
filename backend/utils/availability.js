import { dateKeyInTimeZone } from "./timeZone.js";

// Dos listas de "no disponible" en StoreSettings:
//
// - `unavailableItems` es lo agotado HOY. Solo vale para el día de Tijuana
//   guardado en `unavailableItemsDay`: al día siguiente todo vuelve a estar
//   disponible sin que nadie se acuerde de desmarcarlo (antes se quedaban
//   pegados y los bowls de la casa salían "Agotado" días después).
// - `seasonalUnavailableItems` es lo que no se maneja por temporada (p. ej.
//   el mango fuera de temporada). No se reinicia, no aparece en el armador y
//   solo gerencia la cambia.
//
// Quien valide un pedido o arme el menú debe usar effectiveUnavailableItems,
// nunca leer `unavailableItems` directo.

export const AVAILABILITY_FIELDS = "unavailableItems unavailableItemsDay seasonalUnavailableItems";

export const AVAILABILITY_STATUSES = ["available", "today", "season"];

const MAX_ID_LENGTH = 64;
const MAX_ITEMS = 200;

export function cleanAvailabilityIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = value
    .filter((id) => typeof id === "string")
    .map((id) => id.trim())
    .filter((id) => id && id.length <= MAX_ID_LENGTH);
  return [...new Set(ids)].slice(0, MAX_ITEMS);
}

export function cleanAvailabilityId(value) {
  return cleanAvailabilityIds([value])[0] ?? null;
}

// `unavailableItemsDay` null = lista marcada antes de que existiera el
// reinicio diario; se respeta hasta la siguiente escritura (el arranque del
// servidor le pone la fecha de hoy, ver stampLegacySoldOutDay).
export function todayUnavailableItems(settings, now = new Date()) {
  const items = cleanAvailabilityIds(settings?.unavailableItems);
  const day = settings?.unavailableItemsDay;
  if (day && day !== dateKeyInTimeZone(now)) return [];
  return items;
}

export function seasonalUnavailableItems(settings) {
  return cleanAvailabilityIds(settings?.seasonalUnavailableItems);
}

export function effectiveUnavailableItems(settings, now = new Date()) {
  return [...new Set([...todayUnavailableItems(settings, now), ...seasonalUnavailableItems(settings)])];
}

// Aplica el cambio de un solo ingrediente y regresa las dos listas nuevas.
// Trabajar por ingrediente (y no con la lista completa que manda la pantalla)
// evita que una tablet que se quedó abierta desde ayer revuelva lo de ayer.
export function applyAvailabilityChange(settings, { id, status }, now = new Date()) {
  const today = todayUnavailableItems(settings, now).filter((item) => item !== id);
  const season = seasonalUnavailableItems(settings).filter((item) => item !== id);
  if (status === "today") today.push(id);
  if (status === "season") season.push(id);
  return { today, season };
}

// Pantallas viejas (abiertas antes de esta versión) siguen mandando la lista
// completa con todo lo no disponible: lo que ya es de temporada se queda ahí y
// el resto cuenta como agotado de hoy.
export function applyLegacyAvailabilityList(settings, list) {
  const season = seasonalUnavailableItems(settings);
  const today = cleanAvailabilityIds(list).filter((item) => !season.includes(item));
  return { today, season };
}

export function availabilityUpdate({ today, season }, now = new Date()) {
  return {
    unavailableItems: today,
    unavailableItemsDay: dateKeyInTimeZone(now),
    seasonalUnavailableItems: season,
  };
}

// Forma en que la API devuelve la disponibilidad. `unavailableItems` lleva
// todo lo que no se puede pedir (hoy + temporada) para que los clientes que
// solo leen ese campo sigan funcionando igual.
export function availabilityLists(settings, now = new Date()) {
  return {
    unavailableItems: effectiveUnavailableItems(settings, now),
    todayUnavailableItems: todayUnavailableItems(settings, now),
    seasonalUnavailableItems: seasonalUnavailableItems(settings),
  };
}
