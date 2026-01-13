import jwt from "jsonwebtoken";

export const protect = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.split(" ")[1] : null;

  if (!token) return res.status(401).json({ msg: "No autorizado (sin token)" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id; // 👈 lo usamos para ligar órdenes al usuario
    next();
  } catch {
    return res.status(401).json({ msg: "Token inválido" });
  }
};
