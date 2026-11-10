import jwt from "jsonwebtoken";

const getBearerToken = (req) => {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.split(" ")[1] : null;
};

// Todos los JWT comparten JWT_SECRET, así que se acepta solo el tipo de
// cliente (lista blanca) en vez de excluir tipos conocidos: un tipo nuevo
// (p. ej. staff-pin-upgrade) no debe pasar como sesión de cliente.
// Los tokens sin `type` se aceptan mientras caducan los emitidos antes de
// este cambio (7 días); después hay que quitar `decoded.type === undefined`.
const isCustomerToken = (decoded) =>
  Boolean(decoded?.id) && (decoded.type === "customer" || decoded.type === undefined);

export const protect = (req, res, next) => {
  const token = getBearerToken(req);

  if (!token) return res.status(401).json({ msg: "No autorizado (sin token)" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!isCustomerToken(decoded)) {
      return res.status(401).json({ msg: "Token de cliente inválido" });
    }
    req.userId = decoded.id; // 👈 lo usamos para ligar órdenes al usuario
    next();
  } catch {
    return res.status(401).json({ msg: "Token inválido" });
  }
};

export const optionalAuth = (req, res, next) => {
  const token = getBearerToken(req);

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!isCustomerToken(decoded)) {
      return res.status(401).json({ msg: "Token de cliente inválido" });
    }
    req.userId = decoded.id;
  } catch {
    return res.status(401).json({ msg: "Token inválido" });
  }

  return next();
};

