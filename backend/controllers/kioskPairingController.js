import crypto from "crypto";
import jwt from "jsonwebtoken";
import KioskPairing from "../models/KioskPairing.js";
import User from "../models/User.js";

/** El kiosco pide un token nuevo al cargar la pantalla de pago. */
export const createPairing = async (req, res) => {
  const token = crypto.randomBytes(16).toString("hex");
  await KioskPairing.create({ _id: token });
  res.status(201).json({ token });
};

/**
 * El celular del cliente llama esto (con su propio login) para "aceptar" el
 * QR que escaneó. Requiere sesión de cliente (protect) — el kiosco nunca ve
 * la contraseña ni el token largo del cliente, solo el resultado.
 */
export const confirmPairing = async (req, res) => {
  const { token } = req.params;

  const pairing = await KioskPairing.findById(token);
  if (!pairing) {
    return res.status(404).json({ msg: "Este código ya expiró. Regresa al kiosco y escanea uno nuevo." });
  }
  if (pairing.confirmedAt) {
    return res.status(409).json({ msg: "Este código ya se usó." });
  }

  pairing.userId = req.userId;
  pairing.confirmedAt = new Date();
  await pairing.save();

  const user = await User.findById(req.userId).select("name");
  res.json({ ok: true, name: user?.name || "" });
};

/**
 * El kiosco hace polling aquí. Una vez confirmado, se entrega un JWT de
 * cliente de vida MUY corta (solo para mandar el pedido) en vez del token
 * real de 7 días del cliente — el kiosco es una pantalla compartida y no
 * debe quedarse con una credencial de larga duración de nadie.
 */
export const getPairingStatus = async (req, res) => {
  const { token } = req.params;

  const pairing = await KioskPairing.findById(token);
  if (!pairing) {
    return res.status(404).json({ status: "expired" });
  }
  if (!pairing.confirmedAt) {
    return res.json({ status: "pending" });
  }
  if (pairing.consumedAt) {
    return res.status(409).json({ status: "already_consumed" });
  }

  const user = await User.findById(pairing.userId).select("name phone points");
  if (!user) {
    return res.status(404).json({ status: "expired" });
  }

  pairing.consumedAt = new Date();
  await pairing.save();

  const orderToken = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: "5m" });

  res.json({
    status: "confirmed",
    name: user.name,
    phone: user.phone || "",
    points: user.points,
    orderToken,
  });
};
