import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  WebAuthnError,
  relyingPartyFor,
  userHandleFor,
  verifyAuthentication,
  verifyRegistration,
} from "../utils/webauthn.js";

// Simula un autenticador de plataforma (Face ID) con una llave P-256 real,
// armando authenticatorData y clientDataJSON como lo hace el navegador.
const ORIGIN = "https://pokepalace.org";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sha256 = (data) => crypto.createHash("sha256").update(data).digest();

function makeAuthenticator() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    privateKey,
    credentialId: crypto.randomBytes(16),
    spki: b64url(publicKey.export({ type: "spki", format: "der" })),
  };
}

function authData({ rpId = "pokepalace.org", flags = 0x05, signCount = 0, credentialId = null }) {
  const head = Buffer.alloc(37);
  sha256(rpId).copy(head, 0);
  head[32] = flags;
  head.writeUInt32BE(signCount, 33);
  if (!credentialId) return head;
  const idLength = Buffer.alloc(2);
  idLength.writeUInt16BE(credentialId.length);
  // aaguid en ceros + id + una llave COSE de relleno (no se decodifica).
  return Buffer.concat([head, Buffer.alloc(16), idLength, credentialId, Buffer.from([0xa0])]);
}

const clientData = ({ type, challenge, origin = ORIGIN }) =>
  Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

function registration(auth, challenge, overrides = {}) {
  return {
    id: b64url(auth.credentialId),
    response: {
      clientDataJSON: b64url(clientData({ type: "webauthn.create", challenge, ...overrides.clientData })),
      authenticatorData: b64url(authData({ flags: 0x45, credentialId: auth.credentialId, ...overrides.authData })),
      publicKey: auth.spki,
      publicKeyAlgorithm: -7,
      transports: ["internal", "hybrid"],
    },
  };
}

function assertion(auth, challenge, overrides = {}) {
  const data = authData({ flags: 0x05, ...overrides.authData });
  const client = clientData({ type: "webauthn.get", challenge, ...overrides.clientData });
  const signature = crypto.sign("sha256", Buffer.concat([data, sha256(client)]), auth.privateKey);
  return {
    id: b64url(auth.credentialId),
    response: {
      clientDataJSON: b64url(client),
      authenticatorData: b64url(data),
      signature: b64url(signature),
    },
  };
}

const stored = (auth, signCount = 0) => ({ publicKey: auth.spki, algorithm: -7, signCount });

test("las passkeys sirven en pokepalace.org y sus subdominios, no en Netlify", () => {
  assert.deepEqual(relyingPartyFor("https://pos.pokepalace.org"), { rpId: "pokepalace.org", origin: "https://pos.pokepalace.org" });
  assert.deepEqual(relyingPartyFor("http://localhost:5173"), { rpId: "localhost", origin: "http://localhost:5173" });
  assert.equal(relyingPartyFor("https://pokepalace.netlify.app"), null);
  assert.equal(relyingPartyFor("http://pokepalace.org"), null);
  assert.equal(relyingPartyFor("https://pokepalace.org.evil.com"), null);
  assert.equal(relyingPartyFor(undefined), null);
});

test("el user handle es el ObjectId del empleado en bytes", () => {
  assert.equal(userHandleFor("64b7f0c2a1b2c3d4e5f60718"), Buffer.from("64b7f0c2a1b2c3d4e5f60718", "hex").toString("base64url"));
});

test("registrar Face ID guarda la llave pública del dispositivo", () => {
  const auth = makeAuthenticator();
  const result = verifyRegistration(registration(auth, "reto-1"), "reto-1");
  assert.equal(result.credentialId, b64url(auth.credentialId));
  assert.equal(result.publicKey, auth.spki);
  assert.equal(result.algorithm, -7);
  assert.equal(result.rpId, "pokepalace.org");
  assert.deepEqual(result.transports, ["internal", "hybrid"]);
});

test("el registro se rechaza con challenge, origen o id equivocados", () => {
  const auth = makeAuthenticator();
  assert.throws(() => verifyRegistration(registration(auth, "otro"), "reto-1"), WebAuthnError);
  assert.throws(
    () => verifyRegistration(registration(auth, "reto-1", { clientData: { origin: "https://evil.com" } }), "reto-1"),
    WebAuthnError
  );
  const swapped = registration(auth, "reto-1");
  swapped.id = b64url(crypto.randomBytes(16));
  assert.throws(() => verifyRegistration(swapped, "reto-1"), WebAuthnError);
});

test("el registro exige que el usuario haya pasado Face ID", () => {
  const auth = makeAuthenticator();
  // 0x41 = presente + credencial, pero sin verificación biométrica.
  const noUv = registration(auth, "reto-1", { authData: { flags: 0x41 } });
  assert.throws(() => verifyRegistration(noUv, "reto-1"), /biométrica/);
});

test("el registro rechaza una llave que no coincide con el algoritmo", () => {
  const auth = makeAuthenticator();
  const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey;
  const mismatch = registration(auth, "reto-1");
  mismatch.response.publicKey = b64url(rsa.export({ type: "spki", format: "der" }));
  assert.throws(() => verifyRegistration(mismatch, "reto-1"), /algoritmo/);
});

test("entrar con Face ID verifica la firma del dispositivo", () => {
  const auth = makeAuthenticator();
  const result = verifyAuthentication(assertion(auth, "reto-2"), "reto-2", stored(auth));
  assert.equal(result.signCount, 0);
});

test("una firma de otro dispositivo no sirve para entrar", () => {
  const owner = makeAuthenticator();
  const attacker = makeAuthenticator();
  assert.throws(
    () => verifyAuthentication(assertion(attacker, "reto-2"), "reto-2", stored(owner)),
    /Firma inválida/
  );
});

test("el inicio de sesión se rechaza fuera del dominio o del challenge", () => {
  const auth = makeAuthenticator();
  assert.throws(() => verifyAuthentication(assertion(auth, "reto-2"), "reto-3", stored(auth)), /Challenge/);
  assert.throws(
    () => verifyAuthentication(assertion(auth, "reto-2", { authData: { rpId: "evil.com" } }), "reto-2", stored(auth)),
    /rpId/
  );
  assert.throws(
    () => verifyAuthentication(assertion(auth, "reto-2", { clientData: { type: "webauthn.create" } }), "reto-2", stored(auth)),
    /Tipo/
  );
});

test("un contador que retrocede delata una llave clonada", () => {
  const auth = makeAuthenticator();
  const next = verifyAuthentication(assertion(auth, "r", { authData: { signCount: 6 } }), "r", stored(auth, 5));
  assert.equal(next.signCount, 6);
  assert.throws(
    () => verifyAuthentication(assertion(auth, "r", { authData: { signCount: 5 } }), "r", stored(auth, 5)),
    /Contador/
  );
});

test("los challenges firmados caducan con su propósito y no se reutilizan", async () => {
  process.env.JWT_SECRET ||= "test-secret";
  const { issueChallenge, consumeChallenge } = await import("../utils/webauthnChallenge.js");

  const login = issueChallenge("login");
  assert.equal(consumeChallenge(login.challengeToken, "login"), login.challenge);
  assert.throws(() => consumeChallenge(login.challengeToken, "login"), /ya utilizado/);

  const register = issueChallenge("register", "64b7f0c2a1b2c3d4e5f60718");
  assert.throws(() => consumeChallenge(register.challengeToken, "login"), /inválido/);
  assert.throws(() => consumeChallenge(register.challengeToken, "register", "64b7f0c2a1b2c3d4e5f60719"), /inválido/);
  assert.equal(consumeChallenge(register.challengeToken, "register", "64b7f0c2a1b2c3d4e5f60718"), register.challenge);

  assert.throws(() => consumeChallenge("no-es-un-jwt", "login"), /expiró/);
});
