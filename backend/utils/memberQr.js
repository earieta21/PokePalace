import crypto from "crypto";
import jwt from "jsonwebtoken";

export const MEMBER_QR_PREFIX = "POKEPALACE-MEMBER:";
export const MEMBER_QR_TTL_SECONDS = 15 * 60;

export function createMemberQr(userId) {
  const issuedAt = Date.now();
  const expiresAt = new Date(issuedAt + MEMBER_QR_TTL_SECONDS * 1000);
  const token = jwt.sign(
    {
      id: String(userId),
      type: "member_qr",
      purpose: "loyalty_member",
      jti: crypto.randomBytes(16).toString("hex"),
    },
    process.env.JWT_SECRET,
    {
      expiresIn: MEMBER_QR_TTL_SECONDS,
      issuer: "pokepalace",
      audience: "pokepalace-pos",
    }
  );

  return {
    payload: `${MEMBER_QR_PREFIX}${token}`,
    expiresAt,
  };
}

export function verifyMemberQr(rawPayload) {
  const payload = String(rawPayload || "").trim();
  if (!payload.startsWith(MEMBER_QR_PREFIX)) {
    const error = new Error("El código no es un QR de miembro de Poke Palace");
    error.status = 400;
    throw error;
  }

  const token = payload.slice(MEMBER_QR_PREFIX.length).trim();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "pokepalace",
      audience: "pokepalace-pos",
    });
    if (
      decoded?.type !== "member_qr" ||
      decoded?.purpose !== "loyalty_member" ||
      !decoded?.id ||
      !decoded?.jti
    ) {
      throw new Error("invalid member token");
    }
    return decoded;
  } catch (cause) {
    const error = new Error(
      cause?.name === "TokenExpiredError"
        ? "El QR del miembro venció. Pídele al cliente que lo actualice."
        : "El QR del miembro no es válido"
    );
    error.status = 401;
    throw error;
  }
}
