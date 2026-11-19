import test from "node:test";
import assert from "node:assert/strict";
import { getPickupOptions } from "../../src/order/pickupOptions.js";
import { scheduledPickupProblem } from "../utils/pickupSchedule.js";

const pickup = { fulfillment: "pickup", isScheduled: false };
const at = (instant, order = pickup) => getPickupOptions(order, new Date(instant));

test("antes de abrir ofrece hoy a las 11 en Tijuana y envía el instante que acepta el servidor", () => {
  const now = "2026-11-18T18:30:00Z";
  const options = at(now);
  assert.equal(options.open, false);
  assert.equal(options.today, true);
  assert.equal(options.min, "2026-11-18T11:00");
  assert.equal(options.scheduledAt, "2026-11-18T19:00:00.000Z");
  assert.equal(scheduledPickupProblem(new Date(options.scheduledAt), new Date(now)), null);
});

test("cerca de la apertura sugiere un minuto válido con 15 minutos de anticipación", () => {
  const now = "2026-11-18T18:56:23.404Z";
  const options = at(now);
  assert.equal(options.min, "2026-11-18T11:12");
  assert.equal(scheduledPickupProblem(new Date(options.scheduledAt), new Date(now)), null);
});

test("después del cierre ofrece mañana, incluso al cambiar al horario de verano o invierno", () => {
  for (const [now, key, expected] of [
    ["2026-03-08T05:05:00Z", "2026-03-08T11:00", "2026-03-08T18:00:00.000Z"],
    ["2026-11-01T04:05:00Z", "2026-11-01T11:00", "2026-11-01T19:00:00.000Z"],
    ["2027-01-01T05:05:00Z", "2027-01-01T11:00", "2027-01-01T19:00:00.000Z"],
  ]) {
    const options = at(now);
    assert.equal(options.today, false);
    assert.equal(options.min, key);
    assert.equal(options.scheduledAt, expected);
  }
});

test("durante el horario normal un pedido inmediato conserva esa modalidad", () => {
  const options = at("2026-07-17T20:45:00Z");
  assert.equal(options.open, true);
  assert.equal(options.scheduledAt, null);
  assert.equal(options.errorKey, null);
});

test("elige otro horario de Tijuana y descarta fechas inválidas o fuera del rango del selector", () => {
  const now = "2026-11-18T18:30:00Z";
  const select = (scheduledPickupTime) => at(now, { ...pickup, isScheduled: true, scheduledPickupTime });
  const nextDay = select("2026-11-19T13:20");
  assert.equal(nextDay.scheduledAt, "2026-11-19T21:20:00.000Z");
  assert.equal(nextDay.errorKey, null);
  for (const invalid of ["", "2026-11-18T10:00", "2026-11-18T21:00", "2026-11-20T12:00", "2026-11-33T11:00"]) {
    assert.ok(select(invalid).errorKey);
    assert.equal(select(invalid).scheduledAt, null);
  }
});

test("los pedidos para comer en restaurante solo pueden confirmarse durante el horario de atención", () => {
  const dineIn = { fulfillment: "dine_in", isScheduled: true, scheduledPickupTime: "2026-11-18T17:00" };
  assert.equal(at("2026-11-18T15:00:00Z", dineIn).errorKey, "summary.closedDineIn");
  const open = at("2026-11-18T20:00:00Z", dineIn);
  assert.equal(open.errorKey, null);
  assert.equal(open.scheduledAt, null);
});
