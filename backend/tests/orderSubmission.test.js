import test from "node:test";
import assert from "node:assert/strict";
import {
  clearOrderSubmission,
  getOrCreateOrderSubmission,
  keepOrderSubmissionPayload,
} from "../../src/utils/orderSubmission.js";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

test("cada actor conserva su intento y payload sin sobrescribir a otro", () => {
  values.clear();
  const guest = getOrCreateOrderSubmission("guest");
  const account = getOrCreateOrderSubmission("user:123");
  assert.notEqual(guest.clientOrderId, account.clientOrderId);

  const frozenGuest = keepOrderSubmissionPayload(guest, { base: "white_rice" });
  keepOrderSubmissionPayload(account, { base: "quinoa" });

  assert.equal(getOrCreateOrderSubmission("guest").clientOrderId, guest.clientOrderId);
  assert.deepEqual(getOrCreateOrderSubmission("guest").payload, frozenGuest.payload);
  assert.deepEqual(getOrCreateOrderSubmission("user:123").payload, { base: "quinoa" });

  // An older tab cannot clear a different/newer id, and clearing the account
  // never removes the guest recovery attempt.
  clearOrderSubmission("guest", "web:otro-intento");
  assert.equal(getOrCreateOrderSubmission("guest").clientOrderId, guest.clientOrderId);
  clearOrderSubmission("user:123", account.clientOrderId);
  assert.equal(getOrCreateOrderSubmission("guest").clientOrderId, guest.clientOrderId);
});
