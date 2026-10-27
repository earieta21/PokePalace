/* Verificación de passkeys (WebAuthn) para entrar al portal del staff con
   Face ID / Touch ID / huella / Windows Hello — sin dependencias npm, solo
   node:crypto.

   El navegador entrega la llave pública ya en formato SPKI
   (AuthenticatorAttestationResponse.getPublicKey()), así que no hace falta
   decodificar CBOR. Se pide attestation "none": el registro solo ocurre con
   una sesión de PIN válida y cada quien registra llaves para su propia
   cuenta, así que no hay nada que ganar falsificando el autenticador.

   Lo que sí se verifica siempre: tipo de ceremonia, challenge, origen,
   rpIdHash, que el usuario haya pasado la biometría (flags UP y UV), la firma
   y que el contador no retroceda (llave clonada). */
import crypto from "node:crypto";

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_DATA = 0x40;

// ES256 (Apple, Android, la mayoría) y RS256 (Windows Hello).
export const SUPPORTED_ALGORITHMS = [-7, -257];

export class WebAuthnError extends Error {}

const fail = (message) => { throw new WebAuthnError(message); };

export const toBase64url = (buffer) => Buffer.from(buffer).toString("base64url");

export const fromBase64url = (value, field) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) fail(`${field} inválido`);
  return Buffer.from(value, "base64url");
};

const sha256 = (data) => crypto.createHash("sha256").update(data).digest();

// Las passkeys se registran con rpId "pokepalace.org" para que sirvan igual
// en pokepalace.org, www y pos.pokepalace.org. Los dominios de Netlify no
// comparten ese rpId, así que ahí no se ofrece la función.
export function relyingPartyFor(origin) {
  let url;
  try { url = new URL(origin); } catch { return null; }
  const host = url.hostname;
  if (url.protocol === "https:" && (host === "pokepalace.org" || host.endsWith(".pokepalace.org"))) {
    return { rpId: "pokepalace.org", origin: url.origin };
  }
  if (url.protocol === "http:" && host === "localhost") {
    return { rpId: "localhost", origin: url.origin };
  }
  return null;
}

// El user.id de WebAuthn son los 12 bytes del ObjectId del empleado.
export const userHandleFor = (staffId) => toBase64url(Buffer.from(String(staffId), "hex"));

function parseClientData(clientDataJSON, expectedType, expectedChallenge) {
  const raw = fromBase64url(clientDataJSON, "clientDataJSON");
  let data;
  try { data = JSON.parse(raw.toString("utf8")); } catch { fail("clientDataJSON inválido"); }
  if (data?.type !== expectedType) fail("Tipo de operación inesperado");
  if (typeof data.challenge !== "string" || data.challenge !== expectedChallenge) fail("Challenge no coincide");
  if (data.crossOrigin === true) fail("Origen cruzado no permitido");
  const rp = relyingPartyFor(data.origin);
  if (!rp || rp.origin !== data.origin) fail("Origen no permitido");
  return { raw, rp };
}

function parseAuthenticatorData(authenticatorData, rpId) {
  const data = fromBase64url(authenticatorData, "authenticatorData");
  if (data.length < 37) fail("authenticatorData demasiado corto");
  if (!data.subarray(0, 32).equals(sha256(rpId))) fail("rpId no coincide");
  const flags = data[32];
  if (!(flags & FLAG_USER_PRESENT)) fail("Falta presencia del usuario");
  if (!(flags & FLAG_USER_VERIFIED)) fail("Falta verificación biométrica");
  return { data, flags, signCount: data.readUInt32BE(33) };
}

function importPublicKey(publicKey, algorithm) {
  if (!SUPPORTED_ALGORITHMS.includes(algorithm)) fail("Algoritmo no soportado");
  let key;
  try {
    key = crypto.createPublicKey({ key: fromBase64url(publicKey, "publicKey"), format: "der", type: "spki" });
  } catch (err) {
    if (err instanceof WebAuthnError) throw err;
    fail("Llave pública inválida");
  }
  const matches = algorithm === -7
    ? key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails?.namedCurve === "prime256v1"
    : key.asymmetricKeyType === "rsa";
  if (!matches) fail("La llave no corresponde al algoritmo");
  return key;
}

/* Registro: `response` es lo que manda el navegador tras
   navigator.credentials.create(). Devuelve lo que hay que guardar. */
export function verifyRegistration({ id, response }, expectedChallenge) {
  const credentialId = fromBase64url(id, "id");
  const { rp } = parseClientData(response?.clientDataJSON, "webauthn.create", expectedChallenge);
  const { data, flags, signCount } = parseAuthenticatorData(response?.authenticatorData, rp.rpId);

  // attestedCredentialData: aaguid(16) | largo(2) | credentialId | llave COSE.
  // Se compara el id para que el cliente no pueda registrar uno distinto.
  if (!(flags & FLAG_ATTESTED_DATA) || data.length < 55) fail("Falta la credencial en authenticatorData");
  const idLength = data.readUInt16BE(53);
  const embeddedId = data.subarray(55, 55 + idLength);
  if (embeddedId.length !== idLength || !embeddedId.equals(credentialId)) fail("El id de la credencial no coincide");

  const algorithm = Number(response.publicKeyAlgorithm);
  importPublicKey(response.publicKey, algorithm);

  const transports = Array.isArray(response.transports)
    ? response.transports.filter((t) => typeof t === "string").slice(0, 6)
    : [];

  return {
    credentialId: toBase64url(credentialId),
    publicKey: response.publicKey,
    algorithm,
    signCount,
    transports,
    rpId: rp.rpId,
  };
}

/* Inicio de sesión: verifica la firma de navigator.credentials.get() contra
   la llave guardada. Devuelve el contador nuevo para persistirlo. */
export function verifyAuthentication({ response }, expectedChallenge, credential) {
  const { raw: clientData, rp } = parseClientData(response?.clientDataJSON, "webauthn.get", expectedChallenge);
  const { data, signCount } = parseAuthenticatorData(response?.authenticatorData, rp.rpId);
  const signature = fromBase64url(response?.signature, "signature");

  const key = importPublicKey(credential.publicKey, credential.algorithm);
  const signedData = Buffer.concat([data, sha256(clientData)]);
  if (!crypto.verify("sha256", signedData, key, signature)) fail("Firma inválida");

  // Las passkeys sincronizadas (iCloud, Google) siempre mandan 0; si alguno
  // de los dos lados lleva cuenta, el número tiene que avanzar.
  const stored = credential.signCount || 0;
  if ((signCount > 0 || stored > 0) && signCount <= stored) fail("Contador de la llave inválido");

  return { signCount, rpId: rp.rpId };
}
