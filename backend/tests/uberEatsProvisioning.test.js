import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAuthorizeUrl,
  createOAuthState,
  normalizeUberStores,
  readOAuthState,
} from "../services/uberEatsProvisioning.js";
import { getUberEatsConfig } from "../services/uberEats.js";

const SECRET = "secreto-de-prueba";

test("el enlace de autorización pide eats.pos_provisioning con la Redirect URI configurada", () => {
  const sandbox = getUberEatsConfig({ UBER_EATS_ENV: "sandbox", UBER_EATS_CLIENT_ID: "cid", UBER_EATS_CLIENT_SECRET: "sec" });
  const url = new URL(buildAuthorizeUrl("estado", sandbox));
  assert.equal(url.origin + url.pathname, "https://sandbox-login.uber.com/oauth/v2/authorize");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "eats.pos_provisioning");
  assert.equal(url.searchParams.get("redirect_uri"), "https://pokepalace.onrender.com/api/integrations/uber/oauth/callback");
  assert.equal(url.searchParams.get("state"), "estado");

  const production = getUberEatsConfig({
    UBER_EATS_ENV: "production", UBER_EATS_CLIENT_ID: "cid", UBER_EATS_CLIENT_SECRET: "sec",
    UBER_EATS_REDIRECT_URI: "https://api.example.com/cb",
  });
  const prodUrl = new URL(buildAuthorizeUrl("x", production));
  assert.equal(prodUrl.origin, "https://auth.uber.com");
  assert.equal(prodUrl.searchParams.get("redirect_uri"), "https://api.example.com/cb");
});

test("el state va firmado, vence y no acepta otros tokens", () => {
  const state = createOAuthState({ id: "s1", name: "Dueño" }, SECRET);
  assert.equal(readOAuthState(state, SECRET).staffName, "Dueño");
  assert.equal(readOAuthState(state, "otro-secreto"), null);
  assert.equal(readOAuthState("basura", SECRET), null);
});

test("lee las tiendas de Uber con nombre y dirección", () => {
  const stores = normalizeUberStores({ stores: [
    { store_id: "uuid-1", name: "Poke Palace Centro", location: { address: "Av. Revolución 123", city: "Tijuana" } },
    { name: "Sin id" },
  ] });
  assert.deepEqual(stores, [{ storeId: "uuid-1", name: "Poke Palace Centro", address: "Av. Revolución 123, Tijuana" }]);
  assert.deepEqual(normalizeUberStores(null), []);
});
