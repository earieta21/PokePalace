import { useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";

const STORE_TIME_ZONE = "America/Tijuana";
const OPEN_HOUR = 11;
const CLOSE_HOUR = 21;

function storeClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return Number(values.hour) + Number(values.minute) / 60;
}

export function isStoreOpen(date = new Date()) {
  const hour = storeClock(date);
  return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}

export function useStoreSnapshot() {
  const [now, setNow] = useState(() => new Date());
  const [storeStatus, setStoreStatus] = useState(null);
  const [waitMinutes, setWaitMinutes] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      fetch(`${API_URL}/api/settings/store-status`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("store status"))),
      fetch(`${API_URL}/api/orders/wait-time`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("wait time"))),
    ]).then(([statusResult, waitResult]) => {
      if (statusResult.status === "fulfilled") setStoreStatus(statusResult.value);
      if (waitResult.status === "fulfilled") setWaitMinutes(waitResult.value.waitMinutes ?? null);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return useMemo(() => {
    const open = isStoreOpen(now);
    const ordersPaused = Boolean(storeStatus?.ordersPaused);
    return {
      open,
      ordersPaused,
      acceptingOrders: open && !ordersPaused,
      pausedMessage: storeStatus?.pausedMessage || "",
      waitMinutes,
      beforeOpening: storeClock(now) < OPEN_HOUR,
    };
  }, [now, storeStatus, waitMinutes]);
}
