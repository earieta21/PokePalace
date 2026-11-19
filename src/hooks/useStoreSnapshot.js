import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";
import { isWithinRestaurantHours, restaurantOpenHour } from "../../backend/utils/pickupSchedule.js";
import { zonedParts } from "../../backend/utils/timeZone.js";

export { isWithinRestaurantHours as isStoreOpen };

export function useStoreSnapshot() {
  const [now, setNow] = useState(() => new Date());
  const [storeStatus, setStoreStatus] = useState(null);
  const [waitMinutes, setWaitMinutes] = useState(null);
  const refreshClock = useCallback(() => setNow(new Date()), []);

  useEffect(() => {
    let controller;
    let timer;
    function refresh() {
      window.clearTimeout(timer);
      controller?.abort();
      if (document.hidden) return;
      controller = new AbortController();
      setNow(new Date());
      const options = { signal: controller.signal };
      fetch(`${API_URL}/api/settings/store-status`, options)
        .then(async (response) => { if (response.ok) setStoreStatus(await response.json()); })
        .catch(() => {});
      fetch(`${API_URL}/api/orders/wait-time`, options)
        .then(async (response) => {
          if (response.ok) setWaitMinutes((await response.json()).waitMinutes ?? null);
        })
        .catch(() => {});
      timer = window.setTimeout(refresh, 60_000 - Date.now() % 60_000);
    }
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller?.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return useMemo(() => {
    const open = isWithinRestaurantHours(now);
    const ordersPaused = Boolean(storeStatus?.ordersPaused);
    return {
      now, open, refreshClock,
      ordersPaused,
      acceptingOrders: open && !ordersPaused,
      pausedMessage: storeStatus?.pausedMessage || "",
      waitMinutes,
      beforeOpening: zonedParts(now).hour < restaurantOpenHour(now),
    };
  }, [now, storeStatus, waitMinutes, refreshClock]);
}
