import { createHash } from "node:crypto";

// Customer checkout retries already carry a stable clientOrderId. Deriving the
// Mongo id from it gives every retry (including one after a page reload) the
// same reservation key without trusting a second client-controlled identity.
export function stableCustomerOrderObjectId(clientOrderId) {
  if (typeof clientOrderId !== "string" || !clientOrderId.trim()) {
    throw new TypeError("Se requiere clientOrderId para reservar la orden");
  }

  return createHash("sha256")
    .update(`poke-palace:customer-order:${clientOrderId.trim()}`, "utf8")
    .digest("hex")
    .slice(0, 24);
}
