import jwt from "jsonwebtoken";

const getBearerToken = (req) => {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.split(" ")[1] : null;
};

export const protect = (req, res, next) => {
  const token = getBearerToken(req);

  if (!token) return res.status(401).json({ msg: "No autorizado (sin token)" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.id || decoded.type === "staff") {
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
    if (!decoded?.id || decoded.type === "staff") {
      return res.status(401).json({ msg: "Token de cliente inválido" });
    }
    req.userId = decoded.id;
  } catch {
    return res.status(401).json({ msg: "Token inválido" });
  }

  return next();
};

