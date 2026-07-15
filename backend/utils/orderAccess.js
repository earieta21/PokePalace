import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const generateOrderAccessToken = () => randomBytes(32).toString("base64url");

export const hashOrderAccessToken = (token) =>
  createHash("sha256").update(String(token)).digest("hex");

export const orderAccessTokenMatches = (token, expectedHash) => {
  if (!token || typeof expectedHash !== "string" || !/^[a-f\d]{64}$/i.test(expectedHash)) {
    return false;
  }

  const actual = Buffer.from(hashOrderAccessToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return timingSafeEqual(actual, expected);
};
