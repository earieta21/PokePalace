import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = ["pointerdown", "touchstart", "keydown", "wheel"];

// Resets a walk-in's abandoned order back to the welcome screen after a
// period of no touch/click activity, so the next customer starts fresh.
export default function useIdleTimeout(onIdle, timeoutMs = 60000) {
  const timerRef = useRef(null);

  useEffect(() => {
    const reset = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onIdle, timeoutMs);
    };

    reset();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, reset));

    return () => {
      clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, reset));
    };
  }, [onIdle, timeoutMs]);
}
