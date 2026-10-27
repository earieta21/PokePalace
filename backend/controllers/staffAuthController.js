import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import StaffUser from "../models/StaffUser.js";
import StaffPasskey from "../models/StaffPasskey.js";
import {
  comparePin,
  hashPin,
  isHashedPin,
  isValidPin,
  isValidPinForRole,
  isWeakPin,
  pinLengthForRole,
} from "../utils/staffPin.js";
import { isPinLoginLocked, recordLoginEvent, recordPinFailure } from "../utils/staffLoginGuard.js";
import {
  SUPPORTED_ALGORITHMS,
  WebAuthnError,
  relyingPartyFor,
  userHandleFor,
  verifyAuthentication,
  verifyRegistration,
} from "../utils/webauthn.js";
import { consumeChallenge, issueChallenge } from "../utils/webauthnChallenge.js";

const MANAGER_ROLES = ["owner", "manager", "admin"];
const MAX_PASSKEYS_PER_USER = 10;

// Misma sesión de 12 h tanto si entró con PIN como con Face ID.
const sessionFor = (user) => ({
  token: jwt.sign(
    { id: user._id, role: user.role, type: "staff" },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  ),
  user: {
    id: user._id,
    name: user.name,
    role: user.role,
    color: user.color,
    isManager: MANAGER_ROLES.includes(user.role),
  },
});

// Token que solo sirve para cambiar el PIN (requireStaffAuth lo rechaza por
// su type). Lleva una huella del hash actual para que deje de servir en
// cuanto el PIN cambia.
const pinVersion = (storedPin) =>
  crypto.createHash("sha256").update(String(storedPin || "")).digest("base64url").slice(0, 16);
const upgradeTokenFor = (user) =>
  jwt.sign(
    { id: user._id, type: "staff-pin-upgrade", pv: pinVersion(user.pin) },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  );

// Gerencia con PIN de 4 dígitos no entra hasta crear uno de 6, tampoco con
// Face ID: si no, ese PIN corto seguiría sirviendo para entrar para siempre.
async function respondPinUpgrade(req, res, user, method, locationId) {
  // Una pestaña abierta desde antes de este cambio no sabe mostrar la
  // pantalla del PIN nuevo y entraría sin sesión: se le pide recargar.
  if (req.body?.supportsPinUpgrade !== true) {
    return res.status(409).json({ message: "Hay una versión nueva del portal. Recarga la página y entra de nuevo." });
  }
  await recordLoginEvent(req, { type: "upgrade_required", method, locationId, user });
  return res.json({
    pinUpgradeRequired: true,
    upgradeToken: upgradeTokenFor(user),
    pinLength: pinLengthForRole(user.role),
    user: { name: user.name },
  });
}

async function isPinTaken(locationId, pin, excludeId) {
  const others = await StaffUser.find({ locationId, active: true, _id: { $ne: excludeId } }).select("+pin");
  for (const other of others) {
    if (await comparePin(pin, other.pin)) return true;
  }
  return false;
}

export const pinLogin = async (req, res) => {
  const { pin, locationId } = req.body;
  if (!isValidPin(pin) || typeof locationId !== "string" || !locationId) {
    return res.status(400).json({ message: "pin y locationId requeridos" });
  }
  try {
    if (await isPinLoginLocked(locationId)) {
      return res.status(429).json({
        message: "El acceso con PIN está pausado unos minutos por demasiados intentos fallidos. Si tienes Face ID, úsalo.",
      });
    }
    // Cada comparación de bcrypt tarda ~0.5 s: solo se prueban las cuentas
    // con un PIN de ese largo (o sin largo guardado, de antes de los PIN de 6).
    const enteredLength = String(pin).length;
    const candidates = await StaffUser.find({
      locationId,
      active: true,
      pinLength: { $in: [enteredLength, null] },
    }).select("+pin");
    let user = null;
    for (const candidate of candidates) {
      if (await comparePin(pin, candidate.pin)) {
        user = candidate;
        break;
      }
    }
    if (!user) {
      // Una sucursal inexistente no tiene cuentas que adivinar: no se registra.
      if (candidates.length || await StaffUser.exists({ locationId, active: true })) {
        await recordPinFailure(req, locationId);
      }
      return res.status(401).json({ message: "PIN incorrecto" });
    }
    if (!isHashedPin(user.pin) || user.pinLength !== enteredLength) {
      if (!isHashedPin(user.pin)) user.pin = await hashPin(pin);
      user.pinLength = enteredLength;
      await user.save();
    }
    if (enteredLength < pinLengthForRole(user.role)) {
      return respondPinUpgrade(req, res, user, "pin", locationId);
    }
    await recordLoginEvent(req, { type: "success", method: "pin", locationId, user });
    res.json(sessionFor(user));
  } catch (err) {
    res.status(500).json({ message: "Server error", err: err.message });
  }
};

export const pinUpgrade = async (req, res) => {
  const { upgradeToken, newPin } = req.body || {};
  let payload;
  try {
    payload = jwt.verify(String(upgradeToken || ""), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Pasó demasiado tiempo. Cancela y entra de nuevo con tu PIN actual." });
  }
  if (payload.type !== "staff-pin-upgrade") return res.status(401).json({ message: "Solicitud inválida" });
  try {
    const user = await StaffUser.findOne({ _id: payload.id, active: true }).select("+pin");
    if (!user || pinVersion(user.pin) !== payload.pv) {
      return res.status(401).json({ message: "Esta solicitud ya no es válida. Entra de nuevo con tu PIN." });
    }
    const length = pinLengthForRole(user.role);
    if (!isValidPinForRole(newPin, user.role)) {
      return res.status(400).json({ message: `Tu PIN debe tener ${length} dígitos` });
    }
    if (isWeakPin(newPin)) {
      return res.status(400).json({ message: "Ese PIN es muy fácil de adivinar. Evita números repetidos o seguidos." });
    }
    if (await isPinTaken(user.locationId, newPin, user._id)) {
      return res.status(409).json({ message: "Ese PIN no está disponible. Elige otro." });
    }
    user.pin = await hashPin(newPin);
    user.pinLength = String(newPin).length;
    await user.save();
    await recordLoginEvent(req, { type: "pin_changed", method: "pin", locationId: user.locationId, user });
    await recordLoginEvent(req, { type: "success", method: "pin", locationId: user.locationId, user });
    res.json(sessionFor(user));
  } catch (err) {
    console.error("PIN upgrade error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── Face ID / passkeys ──────────────────────────────────────────────────
   Registrar requiere haber entrado antes con PIN; después, el empleado puede
   entrar desde ese dispositivo solo con su biometría. */

export const passkeyRegisterOptions = async (req, res) => {
  const rp = relyingPartyFor(req.headers.origin);
  if (!rp) return res.status(400).json({ message: "Face ID no está disponible en este dominio" });
  try {
    const existing = await StaffPasskey.find({ staffId: req.staff.id, rpId: rp.rpId })
      .select("credentialId transports")
      .lean();
    const { challenge, challengeToken } = issueChallenge("register", req.staff.id);
    res.json({
      challengeToken,
      options: {
        challenge,
        rp: { id: rp.rpId, name: "Poke Palace Staff" },
        user: { id: userHandleFor(req.staff.id), name: req.staff.name, displayName: req.staff.name },
        pubKeyCredParams: SUPPORTED_ALGORITHMS.map((alg) => ({ type: "public-key", alg })),
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
          userVerification: "required",
        },
        attestation: "none",
        timeout: 60000,
        excludeCredentials: existing.map((c) => ({ type: "public-key", id: c.credentialId, transports: c.transports })),
      },
    });
  } catch (err) {
    console.error("Passkey register options error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const passkeyRegister = async (req, res) => {
  const { challengeToken, credential, deviceLabel } = req.body || {};
  try {
    const challenge = consumeChallenge(challengeToken, "register", req.staff.id);
    const verified = verifyRegistration(credential || {}, challenge);
    const count = await StaffPasskey.countDocuments({ staffId: req.staff.id });
    if (count >= MAX_PASSKEYS_PER_USER) {
      return res.status(409).json({ message: "Ya tienes demasiados dispositivos con Face ID registrados" });
    }
    await StaffPasskey.create({
      staffId: req.staff.id,
      ...verified,
      deviceLabel: typeof deviceLabel === "string" ? deviceLabel.slice(0, 40) : "",
    });
    await recordLoginEvent(req, {
      type: "passkey_registered",
      method: "passkey",
      locationId: req.staff.locationId,
      user: { _id: req.staff.id, name: req.staff.name },
    });
    res.status(201).json({ ok: true, credentialId: verified.credentialId });
  } catch (err) {
    if (err instanceof WebAuthnError) return res.status(400).json({ message: err.message });
    if (err?.code === 11000) return res.status(409).json({ message: "Este dispositivo ya está registrado" });
    console.error("Passkey register error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const passkeyLoginOptions = (req, res) => {
  const rp = relyingPartyFor(req.headers.origin);
  if (!rp) return res.status(400).json({ message: "Face ID no está disponible en este dominio" });
  try {
    const { challenge, challengeToken } = issueChallenge("login");
    res.json({
      challengeToken,
      options: { challenge, rpId: rp.rpId, userVerification: "required", timeout: 60000 },
    });
  } catch (err) {
    console.error("Passkey login options error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const passkeyLogin = async (req, res) => {
  const { challengeToken, credential, locationId } = req.body || {};
  if (typeof credential?.id !== "string" || typeof locationId !== "string" || !locationId) {
    return res.status(400).json({ message: "credencial y locationId requeridos" });
  }
  const failed = (message, extra = {}) => {
    recordLoginEvent(req, { type: "failed", method: "passkey", locationId });
    return res.status(401).json({ message, ...extra });
  };
  try {
    const challenge = consumeChallenge(challengeToken, "login");
    const passkey = await StaffPasskey.findOne({ credentialId: credential.id });
    if (!passkey) {
      return failed("Face ID ya no está activo en este dispositivo. Entra con tu PIN.", { code: "unknown_credential" });
    }
    const userHandle = credential.response?.userHandle;
    if (userHandle && userHandle !== userHandleFor(passkey.staffId)) {
      return failed("La credencial no corresponde a la cuenta");
    }
    const { signCount } = verifyAuthentication(credential, challenge, passkey);

    // +pin: el token para cambiar el PIN lleva una huella del actual.
    const user = await StaffUser.findOne({ _id: passkey.staffId, locationId, active: true }).select("+pin");
    if (!user) return failed("Cuenta no disponible. Habla con tu gerente.");

    passkey.signCount = signCount;
    passkey.lastUsedAt = new Date();
    await passkey.save();
    // Sin pinLength es una cuenta anterior a los PIN de 6: se asume de 4.
    if ((user.pinLength || 4) < pinLengthForRole(user.role)) {
      return respondPinUpgrade(req, res, user, "passkey", locationId);
    }
    await recordLoginEvent(req, { type: "success", method: "passkey", locationId, user });
    res.json(sessionFor(user));
  } catch (err) {
    if (err instanceof WebAuthnError) return failed(err.message);
    console.error("Passkey login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const staffLogin = async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ message: "Invalid credentials" });
  }

  try {
    const user = await StaffUser.findOne({ email, active: true }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        type: "staff",
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Staff login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
