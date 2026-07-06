import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API_URL } from "../config";

const AvailabilityContext = createContext({ unavailableItems: [] });

export function AvailabilityProvider({ children }) {
  const [unavailableItems, setUnavailableItems] = useState([]);

  const fetchAvailability = useCallback(() => {
    fetch(`${API_URL}/api/settings/availability`)
      .then((r) => r.json())
      .then((d) => setUnavailableItems(d.unavailableItems ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAvailability();
    const id = setInterval(fetchAvailability, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchAvailability]);

  return (
    <AvailabilityContext.Provider value={{ unavailableItems, refetch: fetchAvailability }}>
      {children}
    </AvailabilityContext.Provider>
  );
}

export function useAvailability() {
  return useContext(AvailabilityContext);
}
