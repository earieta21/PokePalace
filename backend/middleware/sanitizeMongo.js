/* Bloquea inyección NoSQL a nivel global: recorre body/query/params y
   elimina cualquier llave que empiece con "$" o contenga "." — esas son
   las que Mongo interpreta como operadores de consulta ($ne, $gt, $where,
   "campo.subcampo", etc.) en vez de como texto literal. Sin esto, mandar
   { "email": { "$ne": null } } en vez de un email de verdad puede alterar
   el resultado de un find()/findOne() de formas no previstas.
   Se aplica una sola vez, a nivel de app, así que ninguna ruta —actual
   o futura— se puede quedar sin esta protección por descuido. */

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);

  if (value && typeof value === "object" && !(value instanceof Date)) {
    const clean = {};
    for (const [key, val] of Object.entries(value)) {
      if (key.startsWith("$") || key.includes(".")) continue;
      clean[key] = sanitizeValue(val);
    }
    return clean;
  }

  return value;
}

function sanitizeInPlace(obj) {
  if (!obj || typeof obj !== "object") return;
  const cleaned = sanitizeValue(obj);
  for (const key of Object.keys(obj)) delete obj[key];
  Object.assign(obj, cleaned);
}

export const sanitizeMongo = (req, res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  sanitizeInPlace(req.query);
  sanitizeInPlace(req.params);
  next();
};
