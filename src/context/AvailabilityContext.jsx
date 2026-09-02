import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API_URL } from "../config";

const AvailabilityContext = createContext({ unavailableItems: [], promo2x1Active: false });

export function AvailabilityProvider({ children }) {
  const [unavailableItems, setUnavailableItems] = useState([]);
  // null hasta que se confirme con el servidor, para no mostrar la promo un
  // instante en un día que no toca mientras carga.
  const [promo2x1Active, setPromo2x1Active] = useState(null);

  const fetchAvailability = useCallback(() => {
    fetch(`${API_URL}/api/settings/availability`)
      .then((r) => r.json())
      .then((d) => {
        setUnavailableItems(d.unavailableItems ?? []);
        setPromo2x1Active(Boolean(d.promo2x1Active));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAvailability();
    const id = setInterval(fetchAvailability, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchAvailability]);

  return (
    <AvailabilityContext.Provider value={{ unavailableItems, promo2x1Active, refetch: fetchAvailability }}>
      {children}
    </AvailabilityContext.Provider>
  );
}

export function useAvailability() {
  return useContext(AvailabilityContext);
}
