import ErrorLog from "../models/ErrorLog.js";

const clip = (value, max) => String(value ?? "").slice(0, max);

/* Guarda un error deduplicando: si el mismo mensaje+url se repitió en la
   última hora, solo incrementa el contador en lugar de crear otro registro. */
export async function saveError({ source, message, stack, url, userAgent }) {
  if (!message) return null;
  const doc = {
    source,
    message:   clip(message, 500),
    stack:     clip(stack, 2000),
    url:       clip(url, 300),
    userAgent: clip(userAgent, 300),
  };
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existing = await ErrorLog.findOneAndUpdate(
      { source: doc.source, message: doc.message, url: doc.url, lastSeenAt: { $gte: oneHourAgo } },
      { $inc: { count: 1 }, $set: { lastSeenAt: new Date() } },
      { new: true }
    );
    if (existing) return existing;
    return await ErrorLog.create(doc);
  } catch {
    return null; // el monitoreo nunca debe tumbar nada
  }
}

/* Errores del propio servidor (middleware/procesos) */
export function logServerError(err, origin = "") {
  return saveError({
    source:  "backend",
    message: err?.message || String(err),
    stack:   err?.stack || "",
    url:     origin,
  });
}

/* POST /api/monitor/error — público (los clientes no están logueados cuando
   algo truena), protegido por rate limit y con campos recortados. */
export const reportClientError = async (req, res) => {
  const { message, stack, url } = req.body || {};
  await saveError({
    source: "frontend",
    message,
    stack,
    url,
    userAgent: req.headers["user-agent"] || "",
  });
  res.json({ ok: true });
};

/* GET /api/monitor/errors — staff senior: últimos errores + resumen */
export const getErrors = async (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const [recent, weekCount] = await Promise.all([
      ErrorLog.find().sort({ lastSeenAt: -1 }).limit(50).lean(),
      ErrorLog.aggregate([
        { $match: { lastSeenAt: { $gte: weekAgo } } },
        { $group: { _id: null, total: { $sum: "$count" } } },
      ]),
    ]);
    res.json({ errors: recent, weekTotal: weekCount[0]?.total || 0 });
  } catch (err) {
    res.status(500).json({ message: "Error al consultar errores", err: err.message });
  }
};
