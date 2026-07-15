import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const signToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateRegistration = ({ name, email, password }) => {
  if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {
    return "Todos los campos son obligatorios";
  }
  if (name.trim().length < 2 || name.trim().length > 80) {
    return "Escribe un nombre válido";
  }
  if (!EMAIL_PATTERN.test(normalizeEmail(email))) {
    return "Escribe un correo electrónico válido";
  }
  if (password.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres";
  }
  // bcrypt only considers the first 72 bytes. Rejecting longer values avoids
  // two visually different passwords being treated as the same credential.
  if (Buffer.byteLength(password, "utf8") > 72) {
    return "La contraseña es demasiado larga";
  }
  return null;
};

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const validationError = validateRegistration({ name, email, password });
    if (validationError) return res.status(400).json({ msg: validationError });

    const cleanName = name.trim();
    const cleanEmail = normalizeEmail(email);

    const exists = await User.findOne({ email: cleanEmail });
    if (exists) {
      return res.status(400).json({ msg: "Ese email ya está registrado" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      password: hashedPassword,
    });

    const token = signToken(user._id);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        points: user.points,
        lifetimePoints: user.lifetimePoints,
      },
    });
  } catch {
    res.status(500).json({ msg: "Error al registrar usuario" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return res.status(400).json({ msg: "Email y password son obligatorios" });
    }

    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user) return res.status(400).json({ msg: "Credenciales inválidas" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ msg: "Credenciales inválidas" });

    const token = signToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        points: user.points,
        lifetimePoints: user.lifetimePoints,
      },
    });
  } catch {
    res.status(500).json({ msg: "Error al iniciar sesión" });
  }
};
