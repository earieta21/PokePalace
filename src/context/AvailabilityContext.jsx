import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { API_URL } from "../config";

const AvailabilityContext = createContext({ availabilityStatus: "loading", unavailableItems: [], unavailableCatalogItems: [], hiddenIngredients: [], hiddenCatalogItems: [], promo2x1Active: false, comboPalaceActive: false, promoWeekdays: null });

export function AvailabilityProvider({ children }) {
  const [availabilityStatus, setAvailabilityStatus] = useState("loading");
  const pendingRequest = useRef(null);
  const [unavailableItems, setUnavailableItems] = useState([]);
  // Productos del catálogo (bowls de la casa, bebidas, extras) que el
  // servidor rechazaría porque llevan algo agotado — lo calcula el backend
  // con la misma receta con la que valida el pedido.
  const [unavailableCatalogItems, setUnavailableCatalogItems] = useState([]);
  // Ingredientes que el negocio no maneja: no se muestran en absoluto, a
  // diferencia de los agotados, que sí aparecen marcados.
  const [hiddenIngredients, setHiddenIngredients] = useState([]);
  // Productos que llevan algo fuera de temporada (el Skinny sin mango): el
  // menú no los muestra hasta que vuelva la temporada.
  const [hiddenCatalogItems, setHiddenCatalogItems] = useState([]);
  // null hasta que se confirme con el servidor, para no mostrar la promo un
  // instante en un día que no toca mientras carga.
  const [promo2x1Active, setPromo2x1Active] = useState(null);
  // Igual que la 2x1, pero el Combo Palace corre lunes, miércoles y viernes.
  const [comboPalaceActive, setComboPalaceActive] = useState(null);
  // Qué días corre cada promo ({ promo2x1: [2, 4], comboPalace: [1, 3, 5] },
  // 0=domingo), para el letrero del kiosco. null si el servidor no lo manda.
  const [promoWeekdays, setPromoWeekdays] = useState(null);

  const fetchAvailability = useCallback(() => {
    if (pendingRequest.current) return pendingRequest.current;
    setAvailabilityStatus((status) => status === "ready" ? status : "loading");
    pendingRequest.current = fetch(`${API_URL}/api/settings/availability`)
      .then((r) => {
        if (!r.ok) throw new Error("Availability request failed");
        return r.json();
      })
      .then((d) => {
        setUnavailableItems(d.unavailableItems ?? []);
        setUnavailableCatalogItems(d.unavailableCatalogItems ?? []);
        setHiddenIngredients(d.hiddenIngredients ?? []);
        setHiddenCatalogItems(d.hiddenCatalogItems ?? []);
        setPromo2x1Active(Boolean(d.promo2x1Active));
        setComboPalaceActive(Boolean(d.comboPalaceActive));
        setPromoWeekdays(d.promoWeekdays ?? null);
        setAvailabilityStatus("ready");
      })
      .catch(() => setAvailabilityStatus("error"))
      .finally(() => { pendingRequest.current = null; });
    return pendingRequest.current;
  }, []);

  useEffect(() => {
    fetchAvailability();
    const id = setInterval(fetchAvailability, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchAvailability]);

  return (
    <AvailabilityContext.Provider value={{ availabilityStatus, unavailableItems, unavailableCatalogItems, hiddenIngredients, hiddenCatalogItems, promo2x1Active, comboPalaceActive, promoWeekdays, refetch: fetchAvailability }}>
      {children}
    </AvailabilityContext.Provider>
  );
}

export function useAvailability() {
  return useContext(AvailabilityContext);
}
