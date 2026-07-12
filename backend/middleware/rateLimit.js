/* Limitador de solicitudes en memoria — sin dependencias npm.
   Suficiente para una sola instancia de servidor (Render free/starter no
   corre múltiples instancias detrás de un balanceador para este proyecto).
   Cuenta solicitudes por IP dentro de una ventana de tiempo deslizante. */

const buckets = new Map(); // key -> { count, resetAt }

// Limpieza periódica para no acumular memoria indefinidamente
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

export const rateLimit = ({ windowMs, max, message }) => {
  return (req, res, next) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfterSec));
      return res.status(429).json({ msg: message || "Demasiados intentos. Intenta más tarde." });
    }

    next();
  };
};
