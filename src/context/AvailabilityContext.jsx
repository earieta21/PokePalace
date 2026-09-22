import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API_URL } from "../config";

const AvailabilityContext = createContext({ unavailableItems: [], hiddenIngredients: [], promo2x1Active: false, comboPalaceActive: false });

export function AvailabilityProvider({ children }) {
  const [unavailableItems, setUnavailableItems] = useState([]);
  // Ingredientes que el negocio no maneja: no se muestran en absoluto, a
  // diferencia de los agotados, que sí aparecen marcados.
  const [hiddenIngredients, setHiddenIngredients] = useState([]);
  // null hasta que se confirme con el servidor, para no mostrar la promo un
  // instante en un día que no toca mientras carga.
  const [promo2x1Active, setPromo2x1Active] = useState(null);
  // Igual que la 2x1, pero el Combo Palace corre lunes, miércoles y viernes.
  const [comboPalaceActive, setComboPalaceActive] = useState(null);

  const fetchAvailability = useCallback(() => {
    fetch(`${API_URL}/api/settings/availability`)
      .then((r) => r.json())
      .then((d) => {
        setUnavailableItems(d.unavailableItems ?? []);
        setHiddenIngredients(d.hiddenIngredients ?? []);
        setPromo2x1Active(Boolean(d.promo2x1Active));
        setComboPalaceActive(Boolean(d.comboPalaceActive));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAvailability();
    const id = setInterval(fetchAvailability, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchAvailability]);

  return (
    <AvailabilityContext.Provider value={{ unavailableItems, hiddenIngredients, promo2x1Active, comboPalaceActive, refetch: fetchAvailability }}>
      {children}
    </AvailabilityContext.Provider>
  );
}

export function useAvailability() {
  return useContext(AvailabilityContext);
}
