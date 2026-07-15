import { test } from "node:test";
import assert from "node:assert/strict";

import {
  generateOrderAccessToken,
  hashOrderAccessToken,
  orderAccessTokenMatches,
} from "../utils/orderAccess.js";

test("los tokens de orden son secretos aleatorios de 256 bits", () => {
  const first = generateOrderAccessToken();
  const second = generateOrderAccessToken();

  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(second, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
});

test("solo el token correcto coincide con el hash almacenado", () => {
  const token = generateOrderAccessToken();
  const hash = hashOrderAccessToken(token);

  assert.match(hash, /^[a-f\d]{64}$/);
  assert.equal(orderAccessTokenMatches(token, hash), true);
  assert.equal(orderAccessTokenMatches("token-equivocado", hash), false);
  assert.equal(orderAccessTokenMatches(token, "hash-invalido"), false);
});
