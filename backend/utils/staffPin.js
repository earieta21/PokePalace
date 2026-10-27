import crypto from "node:crypto";
import bcrypt from "bcryptjs";

// Empleados usan 4 dígitos; gerencia (dueño, admin, gerente) 6, porque esas
// cuentas ven finanzas, nómina y administran al equipo.
const PIN_PATTERN = /^(\d{4}|\d{6})$/;
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$.{53}$/;
const HASH_ROUNDS = 12;
const MANAGEMENT_ROLES = ["owner", "admin", "manager"];

export const isValidPin = (pin) => PIN_PATTERN.test(String(pin));
export const isHashedPin = (value) => BCRYPT_PATTERN.test(value || "");

export const pinLengthForRole = (role) => (MANAGEMENT_ROLES.includes(role) ? 6 : 4);
export const isValidPinForRole = (pin, role) => isValidPin(pin) && String(pin).length === pinLengthForRole(role);

// Lo primero que prueba quien intenta adivinar: dígitos repetidos (0000,
// 111111) o seguidos hacia arriba o hacia abajo (1234, 987654).
export const isWeakPin = (pin) => {
  const digits = [...String(pin)].map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  return steps.every((s) => s === 0) || steps.every((s) => s === 1) || steps.every((s) => s === -1);
};

const valueToHash = (pin) => {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error("PIN_PEPPER must be configured");
  return crypto.createHmac("sha256", pepper).update(String(pin)).digest("base64");
};

export const hashPin = (pin) => {
  if (!isValidPin(pin)) throw new Error("PIN must contain 4 or 6 digits");
  return bcrypt.hash(valueToHash(pin), HASH_ROUNDS);
};

export const comparePin = async (pin, storedPin) => {
  if (!isValidPin(pin) || !storedPin) return false;
  if (isHashedPin(storedPin)) return bcrypt.compare(valueToHash(pin), storedPin);

  // Compatibility for old records. A successful login upgrades the value.
  return String(pin) === storedPin;
};
