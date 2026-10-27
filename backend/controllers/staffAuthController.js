import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import StaffUser from "../models/StaffUser.js";
import StaffPasskey from "../models/StaffPasskey.js";
import { comparePin, hashPin, isHashedPin, isValidPin } from "../utils/staffPin.js";
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

export const pinLogin = async (req, res) => {
  const { pin, locationId } = req.body;
  if (!isValidPin(pin) || typeof locationId !== "string" || !locationId) {
    return res.status(400).json({ message: "pin y locationId requeridos" });
  }
  try {
    const candidates = await StaffUser.find({ locationId, active: true }).select("+pin");
    let user = null;
    for (const candidate of candidates) {
      if (await comparePin(pin, candidate.pin)) {
        user = candidate;
        break;
      }
    }
    if (!user) {
      return res.status(401).json({ message: "PIN incorrecto" });
    }
    if (!isHashedPin(user.pin)) {
      user.pin = await hashPin(pin);
      await user.save();
    }
    res.json(sessionFor(user));
  } catch (err) {
    res.status(500).json({ message: "Server error", err: err.message });
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
  try {
    const challenge = consumeChallenge(challengeToken, "login");
    const passkey = await StaffPasskey.findOne({ credentialId: credential.id });
    if (!passkey) {
      return res.status(401).json({
        message: "Face ID ya no está activo en este dispositivo. Entra con tu PIN.",
        code: "unknown_credential",
      });
    }
    const userHandle = credential.response?.userHandle;
    if (userHandle && userHandle !== userHandleFor(passkey.staffId)) {
      return res.status(401).json({ message: "La credencial no corresponde a la cuenta" });
    }
    const { signCount } = verifyAuthentication(credential, challenge, passkey);

    const user = await StaffUser.findOne({ _id: passkey.staffId, locationId, active: true });
    if (!user) return res.status(401).json({ message: "Cuenta no disponible. Habla con tu gerente." });

    passkey.signCount = signCount;
    passkey.lastUsedAt = new Date();
    await passkey.save();
    res.json(sessionFor(user));
  } catch (err) {
    if (err instanceof WebAuthnError) return res.status(401).json({ message: err.message });
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
