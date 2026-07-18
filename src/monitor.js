import { API_URL } from "./config";

/* Monitor de errores del lado del cliente — sin dependencias.
   Cuando algo truena en el navegador de un cliente, se reporta al backend
   para que quede registrado y aparezca en los avisos del portal. */

const MAX_REPORTS_PER_SESSION = 5;
let reported = 0;
const seen = new Set();

export function reportError(message, stack = "") {
  if (!message || reported >= MAX_REPORTS_PER_SESSION) return;
  const key = String(message).slice(0, 120);
  if (seen.has(key)) return; // el mismo error repetido no se reenvía
  seen.add(key);
  reported += 1;

  try {
    fetch(`${API_URL}/api/monitor/error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: String(message).slice(0, 500),
        stack:   String(stack || "").slice(0, 2000),
        url:     window.location.href.slice(0, 300),
      }),
      // keepalive permite que el reporte salga aunque la página se esté cerrando
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* el monitoreo jamás debe causar más errores */
  }
}

export function installErrorMonitor() {
  window.addEventListener("error", (event) => {
    // Errores de carga de recursos (img, script) no traen .error — se omiten
    if (!event.error && !event.message) return;
    reportError(event.message || event.error?.message, event.error?.stack);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportError(
      reason?.message || String(reason ?? "Promesa rechazada sin razón"),
      reason?.stack
    );
  });
}
