import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

/* Prueba de integración del flujo crítico: arranca el servidor real contra
   el MongoDB de CI y ejercita las rutas que pagan la renta — crear una orden
   con precio calculado en el servidor, validaciones y autenticación. */

const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}`;
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let server;

before(async () => {
  server = spawn(process.execPath, ["server.js"], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/pokepalace_ci",
      JWT_SECRET: process.env.JWT_SECRET || "ci-test-secret",
      PIN_PEPPER: process.env.PIN_PEPPER || "ci-test-pepper",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  // Espera a que el servidor conteste (mongoose puede tardar en conectar)
  const deadline = Date.now() + 45000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`El servidor no arrancó a tiempo: ${lastError?.message}`);
});

after(() => {
  server?.kill("SIGKILL");
});

// Hora programada determinista: mañana a las 15:00 del reloj del servidor
// (dentro del horario 11-21 sin importar a qué hora corra el CI).
function tomorrowAt15() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setHours(15, 0, 0, 0);
  return d.toISOString();
}

const postJSON = (url, body) =>
  fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("el servidor responde", async () => {
  const r = await fetch(`${BASE}/`);
  assert.equal(r.status, 200);
});

test("crear orden valida: el precio lo pone el servidor, no el cliente", async () => {
  const r = await postJSON("/api/orders", {
    base: "arroz",
    proteins: ["salmon"],
    customer: "Prueba CI",
    phone: "6630000000",
    scheduledPickupTime: tomorrowAt15(),
    total: 1, // intento de manipular el precio — debe ignorarse
  });
  assert.equal(r.status, 201);
  const { order } = await r.json();
  assert.equal(order.total, 249); // precio real del bowl normal
  assert.equal(order.paymentStatus, "pending");
  assert.equal(order.source, "online");
});

test("orden sin base ni proteina se rechaza", async () => {
  const r = await postJSON("/api/orders", {
    customer: "Prueba CI",
    phone: "6630000000",
    scheduledPickupTime: tomorrowAt15(),
  });
  assert.equal(r.status, 400);
});

test("mas de 3 proteinas se rechaza", async () => {
  const r = await postJSON("/api/orders", {
    base: "arroz",
    proteins: ["salmon", "tuna", "shrimp", "tofu"],
    customer: "Prueba CI",
    phone: "6630000000",
    scheduledPickupTime: tomorrowAt15(),
  });
  assert.equal(r.status, 400);
});

test("orden sin nombre/telefono se rechaza", async () => {
  const r = await postJSON("/api/orders", {
    base: "arroz",
    proteins: ["salmon"],
    scheduledPickupTime: tomorrowAt15(),
  });
  assert.equal(r.status, 400);
});

test("pin-login sin locationId se rechaza", async () => {
  const r = await postJSON("/api/staff-auth/pin-login", { pin: "1234" });
  assert.equal(r.status, 400);
});

test("las rutas de staff exigen token", async () => {
  const r = await fetch(`${BASE}/api/staff/inventory`);
  assert.equal(r.status, 401);
});

test("el monitor de errores acepta reportes", async () => {
  const r = await postJSON("/api/monitor/error", {
    message: "error de prueba CI",
    url: "http://ci.test",
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
});
