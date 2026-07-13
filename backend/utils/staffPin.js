import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const PIN_PATTERN = /^\d{4}$/;
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$.{53}$/;
const HASH_ROUNDS = 12;

export const isValidPin = (pin) => PIN_PATTERN.test(String(pin));
export const isHashedPin = (value) => BCRYPT_PATTERN.test(value || "");

const valueToHash = (pin) => {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error("PIN_PEPPER must be configured");
  return crypto.createHmac("sha256", pepper).update(String(pin)).digest("base64");
};

export const hashPin = (pin) => {
  if (!isValidPin(pin)) throw new Error("PIN must contain exactly 4 digits");
  return bcrypt.hash(valueToHash(pin), HASH_ROUNDS);
};

export const comparePin = async (pin, storedPin) => {
  if (!isValidPin(pin) || !storedPin) return false;
  if (isHashedPin(storedPin)) return bcrypt.compare(valueToHash(pin), storedPin);

  // Compatibility for old records. A successful login upgrades the value.
  return String(pin) === storedPin;
};
