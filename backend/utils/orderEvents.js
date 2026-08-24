/* Avisa en tiempo real (Server-Sent Events) a las pantallas conectadas
   (KDS) en cuanto un pedido cambia. Usa un MongoDB change stream sobre la
   colección Order en vez de enganchar cada punto del código que crea o
   actualiza una orden (online, POS, WhatsApp, cancelación, etc.) — así
   cualquier camino nuevo que toque Order queda cubierto automáticamente. */
import Order from "../models/Order.js";

const subscribers = new Set();

export function subscribeToOrderEvents(res) {
  subscribers.add(res);
}

export function unsubscribeFromOrderEvents(res) {
  subscribers.delete(res);
}

export function broadcastOrdersChanged() {
  for (const res of subscribers) {
    try {
      res.write("event: orders_changed\ndata: {}\n\n");
    } catch {
      subscribers.delete(res);
    }
  }
}

let started = false;

// Requiere que Mongo corra como replica set — Atlas (incluido el plan
// gratis M0) siempre corre así, así que esto funciona sin configuración
// extra. Si el stream se cae (reinicio de Mongo, red, etc.) se reintenta
// solo tras una pausa corta.
export function startOrderChangeStream() {
  if (started) return;
  started = true;

  try {
    const stream = Order.watch();
    stream.on("change", () => broadcastOrdersChanged());
    stream.on("error", (err) => {
      console.error("Order change stream error:", err.message);
      started = false;
      setTimeout(startOrderChangeStream, 5000);
    });
  } catch (err) {
    console.error("No se pudo iniciar el change stream de Order:", err.message);
    started = false;
    setTimeout(startOrderChangeStream, 5000);
  }
}

/* GET /api/staff/orders/events — conexión SSE de larga duración. El
   cliente solo necesita saber que "algo cambió" y volver a pedir su lista
   con el endpoint REST que ya usa; el payload del evento va vacío a
   propósito para no duplicar la lógica de serialización/permisos por rol. */
export function streamOrderEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");

  subscribeToOrderEvents(res);

  // Mantiene viva la conexión a través de proxies que cierran conexiones
  // inactivas (Render, etc.) — un comentario SSE no dispara ningún evento
  // en el cliente, solo evita el timeout de idle.
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribeFromOrderEvents(res);
  });
}
