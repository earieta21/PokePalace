/* Challenges de WebAuthn sin guardar estado en Mongo: el challenge viaja al
   cliente firmado dentro de un JWT corto y regresa con la respuesta. Para
   que una misma respuesta no se pueda reenviar, cada challenge se marca como
   usado en memoria hasta que expira (igual que rateLimit.js, basta con una
   sola instancia del servidor). */
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { WebAuthnError } from "./webauthn.js";

const CHALLENGE_TTL_SECONDS = 180;
const usedChallenges = new Map(); // challenge -> expira (ms)

setInterval(() => {
  const now = Date.now();
  for (const [challenge, expiresAt] of usedChallenges) {
    if (expiresAt <= now) usedChallenges.delete(challenge);
  }
}, 5 * 60 * 1000).unref?.();

export function issueChallenge(purpose, staffId = null) {
  const challenge = crypto.randomBytes(32).toString("base64url");
  const challengeToken = jwt.sign(
    { type: "webauthn-challenge", purpose, challenge, staffId: staffId ? String(staffId) : null },
    process.env.JWT_SECRET,
    { expiresIn: CHALLENGE_TTL_SECONDS }
  );
  return { challenge, challengeToken };
}

export function consumeChallenge(challengeToken, purpose, staffId = null) {
  let payload;
  try {
    payload = jwt.verify(String(challengeToken || ""), process.env.JWT_SECRET);
  } catch {
    throw new WebAuthnError("La solicitud expiró, intenta de nuevo");
  }
  if (payload.type !== "webauthn-challenge" || payload.purpose !== purpose) {
    throw new WebAuthnError("Challenge inválido");
  }
  if (staffId && payload.staffId !== String(staffId)) throw new WebAuthnError("Challenge inválido");
  if (usedChallenges.has(payload.challenge)) throw new WebAuthnError("Challenge ya utilizado");
  usedChallenges.set(payload.challenge, payload.exp * 1000);
  return payload.challenge;
}
