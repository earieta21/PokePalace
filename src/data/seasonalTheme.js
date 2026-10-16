import { tijuanaDateKey } from "../utils/date";

// Tema de temporada del sitio de clientes. Halloween corre todo octubre en
// hora de Tijuana y se apaga solo el 1 de noviembre. Para revisarlo fuera de
// fecha: ?tema=halloween (o ?tema=normal para verlo sin tema).
export const isHalloweenSeason = (date = new Date()) => tijuanaDateKey(date).slice(5, 7) === "10";

export function useHalloweenTheme() {
  if (typeof window !== "undefined") {
    const override = new URLSearchParams(window.location.search).get("tema");
    if (override === "halloween") return true;
    if (override === "normal") return false;
  }
  return isHalloweenSeason();
}
