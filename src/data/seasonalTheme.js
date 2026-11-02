import { useEffect, useState } from "react";
import { tijuanaDateKey } from "../utils/date";

// Tema de temporada del sitio de clientes. Halloween corre todo octubre en
// hora de Tijuana y se apaga solo el 1 de noviembre. Para revisarlo fuera de
// fecha: ?tema=halloween (o ?tema=normal para verlo sin tema).
export const isHalloweenSeason = (date = new Date()) => tijuanaDateKey(date).slice(5, 7) === "10";

// Se revisa cada minuto: el marco del kiosco no se vuelve a pintar solo y
// las iPads siguieron en Halloween después del 31 de octubre.
const SEASON_CHECK_MS = 60 * 1000;

export function useHalloweenTheme() {
  const [season, setSeason] = useState(isHalloweenSeason);
  useEffect(() => {
    const timer = setInterval(() => setSeason(isHalloweenSeason()), SEASON_CHECK_MS);
    return () => clearInterval(timer);
  }, []);
  if (typeof window !== "undefined") {
    const override = new URLSearchParams(window.location.search).get("tema");
    if (override === "halloween") return true;
    if (override === "normal") return false;
  }
  return season;
}
