import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {
  createMemberQr,
  MEMBER_QR_PREFIX,
  verifyMemberQr,
} from "../utils/memberQr.js";

process.env.JWT_SECRET ||= "member-qr-unit-test-secret";

test("el QR de miembro contiene solo un token temporal de propósito limitado", () => {
  const memberId = "507f1f77bcf86cd799439011";
  const card = createMemberQr(memberId);
  assert.match(card.payload, /^POKEPALACE-MEMBER:/);
  assert.ok(card.expiresAt > new Date());

  const token = card.payload.slice(MEMBER_QR_PREFIX.length);
  const decoded = jwt.decode(token);
  assert.equal(decoded.id, memberId);
  assert.equal(decoded.type, "member_qr");
  assert.equal(decoded.purpose, "loyalty_member");
  assert.ok(decoded.jti);
  assert.equal("email" in decoded, false);
  assert.equal("points" in decoded, false);

  const verified = verifyMemberQr(card.payload);
  assert.equal(verified.id, memberId);
  assert.equal(verified.jti, decoded.jti);
});

test("el lector rechaza texto normal y tokens de miembro vencidos", () => {
  assert.throws(
    () => verifyMemberQr("un-qr-ajeno"),
    /no es un QR de miembro/i
  );

  const expired = jwt.sign(
    {
      id: "507f1f77bcf86cd799439011",
      type: "member_qr",
      purpose: "loyalty_member",
      jti: "expired-unit-test",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: -1,
      issuer: "pokepalace",
      audience: "pokepalace-pos",
    }
  );

  assert.throws(
    () => verifyMemberQr(`${MEMBER_QR_PREFIX}${expired}`),
    /venció/i
  );
});
