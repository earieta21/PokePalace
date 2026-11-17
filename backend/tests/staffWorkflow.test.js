import { test } from "node:test";
import assert from "node:assert/strict";
import TimeRecord from "../models/TimeRecord.js";
import Order from "../models/Order.js";
import ChecklistRecord from "../models/ChecklistRecord.js";
import TempRecord from "../models/TempRecord.js";
import { clockIn, clockOut, startBreak, endBreak, toggleChecklistItem, addTempRecord } from "../controllers/kioskController.js";
import { getAllOrders } from "../controllers/staffOrderController.js";
import { dateKeyInTimeZone } from "../utils/timeZone.js";
import { readStaffResponse } from "../../src/staff/staffRequest.js";

const employeeId = "a".repeat(24), recordId = "b".repeat(24);
const request = (body = {}) => ({ staff: { id: employeeId, role: "owner", locationId: "test" }, body: { locationId: "test", ...body } });
const response = () => ({ code: 200, headers: {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; }, set(key, value) { this.headers[key] = value; return this; } });

test("el índice limita a un turno abierto por persona sin afectar turnos cerrados", () => {
  const index = TimeRecord.schema.indexes().find(([, options]) => options.name === "one_open_shift_per_employee");
  assert.deepEqual(index[0], { employeeId: 1 });
  assert.equal(index[1].unique, true);
  assert.deepEqual(index[1].partialFilterExpression, { clockOut: null });
});

test("entradas simultáneas y respuesta perdida recuperan el mismo turno", async (t) => {
  let record = null, attempts = 0;
  const ensure = t.mock.method(TimeRecord.collection, "createIndex", async (_key, opts) => {
    assert.equal(opts.unique, true); assert.deepEqual(opts.partialFilterExpression, { clockOut: null });
  });
  t.mock.method(TimeRecord, "findOne", async () => record);
  t.mock.method(TimeRecord, "create", async (data) => {
    attempts++;
    if (record) throw Object.assign(new Error("duplicate"), { code: 11000 });
    record = { ...data, _id: recordId, breaks: [], clockOut: null };
    throw new Error("Acknowledgement lost");
  });
  const responses = [response(), response()];
  await Promise.all(responses.map((res) => clockIn(request(), res)));
  assert.equal(ensure.mock.callCount(), 1);
  assert.ok(attempts >= 1);
  for (const res of responses) { assert.equal(res.code, 200); assert.equal(res.data.record._id, recordId); assert.equal(res.data.recovered, true); }
  const retry = response(); await clockIn(request(), retry);
  assert.equal(retry.data.record._id, recordId);
});

test("no recupera un turno de otra sucursal ni omite validación GPS", async (t) => {
  t.mock.method(TimeRecord, "findOne", async () => ({ locationId: "other" }));
  const res = response(); await clockIn(request(), res); assert.equal(res.code, 409);
  const req = request(); req.staff.role = "employee";
  const gps = response(); await clockIn(req, gps); assert.equal(gps.code, 403);
});

test("salir de un turno no cierra un lonche iniciado simultáneamente", async (t) => {
  let reads = 0;
  t.mock.method(TimeRecord, "findOne", async (query) => {
    assert.equal(query._id, recordId); assert.equal(query.employeeId, employeeId);
    return { _id: recordId, clockOut: null, breaks: reads++ ? [{ start: new Date(), end: null }] : [] };
  });
  t.mock.method(TimeRecord, "findOneAndUpdate", async (query) => {
    assert.deepEqual(query.breaks, { $not: { $elemMatch: { end: null } } });
    assert.equal(query.clockOut, null); return null;
  });
  const res = response(); await clockOut(request({ recordId }), res); assert.equal(res.code, 409);
});

test("reintentar una salida recupera el turno cerrado sin tocar otro turno", async (t) => {
  const closed = { _id: recordId, clockOut: new Date(), breaks: [] };
  t.mock.method(TimeRecord, "findOne", async (filter) => { assert.equal(filter._id, recordId); return closed; });
  const update = t.mock.method(TimeRecord, "findOneAndUpdate", () => { throw new Error("Must not write"); });
  const res = response(); await clockOut(request({ recordId }), res);
  assert.equal(res.code, 200); assert.equal(res.data.recovered, true); assert.equal(update.mock.callCount(), 0);
});

test("dos inicios de lonche recuperan el lonche creado por la primera solicitud", async (t) => {
  const record = { _id: recordId, clockOut: null, breaks: [] };
  t.mock.method(TimeRecord, "findOne", async () => ({ ...record, breaks: [...record.breaks] }));
  t.mock.method(TimeRecord, "findOneAndUpdate", async (filter, update) => {
    assert.equal(filter.clockOut, null); assert.ok(filter.breaks.$not.$elemMatch);
    if (record.breaks.length) return null;
    record.breaks.push(update.$push.breaks); return record;
  });
  const responses = [response(), response()];
  await Promise.all(responses.map((res) => startBreak(request({ recordId }), res)));
  assert.equal(record.breaks.length, 1);
  assert.ok(responses.every((res) => [200, 201].includes(res.code)));
});

test("un reintento de terminar lonche no termina un lonche posterior", async (t) => {
  const start = "2026-11-11T18:00:00.000Z";
  const record = { _id: recordId, clockOut: null, breaks: [{ start, end: "2026-11-11T18:30:00.000Z" }, { start: "2026-11-11T22:00:00.000Z", end: null }] };
  t.mock.method(TimeRecord, "findOne", async () => record);
  const update = t.mock.method(TimeRecord, "findOneAndUpdate", () => { throw new Error("Must not write"); });
  const res = response(); await endBreak(request({ recordId, breakStartedAt: start }), res);
  assert.equal(res.code, 200); assert.equal(res.data.recovered, true); assert.equal(update.mock.callCount(), 0);
});

test("rechaza identificadores de turno inválidos antes de consultar", async (t) => {
  const read = t.mock.method(TimeRecord, "findOne", () => { throw new Error("Must not read"); });
  for (const action of [clockOut, startBreak, endBreak]) {
    const res = response(); await action(request({ recordId: "bad-id" }), res); assert.equal(res.code, 400);
  }
  assert.equal(read.mock.callCount(), 0);
});

test("cocina recibe más de 30 pedidos, solo activos, preservando privacidad", async (t) => {
  let selection, sort;
  const records = Array.from({ length: 85 }, (_, i) => ({ _id: String(i), status: "pending" }));
  const chain = {
    sort(value) { sort = value; return this; },
    select(value) { selection = value; return this; },
    skip() { throw new Error("Active queue must not skip"); },
    limit() { throw new Error("Active queue must not truncate"); },
    then(resolve) { return Promise.resolve(records).then(resolve); },
  };
  t.mock.method(Order, "find", (filter) => {
    assert.deepEqual(filter.status.$in, ["pending", "preparing", "ready"]); return chain;
  });
  const res = response(); await getAllOrders({ staff: { role: "kitchen" }, query: { queue: "active", status: "completed", limit: "1", skip: "100" } }, res);
  assert.equal(res.data.orders.length, 85); assert.deepEqual(sort, { createdAt: 1, _id: 1 });
  assert.ok(selection.includes("-user")); assert.equal(res.headers["Cache-Control"], "no-store");
});

test("las consultas históricas conservan paginación", async (t) => {
  let limit, skip;
  const chain = { sort() { return this; }, skip(v) { skip = v; return this; }, limit(v) { limit = v; return this; }, populate() { return this; }, then(resolve) { return Promise.resolve([]).then(resolve); } };
  t.mock.method(Order, "find", () => chain);
  const res = response(); await getAllOrders({ staff: { role: "owner" }, query: { limit: "40", skip: "20" } }, res);
  assert.equal(limit, 40); assert.equal(skip, 20); assert.equal(res.code, 200);
});

test("marcar una tarea actualiza solo su casilla y conserva las otras", async (t) => {
  t.mock.method(ChecklistRecord, "findOneAndUpdate", async (filter, update) => {
    assert.equal(filter.listId, "apertura"); assert.deepEqual(Object.keys(update.$set), ["items.2"]);
    return { items: new Map([["0", { by: "other" }], ["2", update.$set["items.2"]]]) };
  });
  const res = response(); await toggleChecklistItem(request({ date: dateKeyInTimeZone(), listId: "apertura", idx: 2, checked: true }), res);
  assert.equal(res.code, 200); assert.equal(res.data.items[0].by, "other");
  const invalid = response(); await toggleChecklistItem(request({ date: dateKeyInTimeZone(), listId: "apertura", idx: "2.bad", checked: true }), invalid);
  assert.equal(invalid.code, 400);
});

test("temperatura inválida nunca se registra como cero", async (t) => {
  const insert = t.mock.method(TempRecord, "create", () => { throw new Error("Must not write"); });
  for (const value of [null, "", NaN, Infinity]) {
    const res = response(); await addTempRecord(request({ stationId: "refri-prot", value }), res); assert.equal(res.code, 400);
  }
  assert.equal(insert.mock.callCount(), 0);
});

test("un error HTTP o respuesta incompleta no se interpreta como guardado", async () => {
  await assert.rejects(readStaffResponse(new Response(JSON.stringify({ message: "No autorizado" }), { status: 403 })), /No autorizado/);
  await assert.rejects(readStaffResponse(new Response("bad json", { status: 200 })), /confirmar/);
  await assert.rejects(readStaffResponse(new Response("{}", { status: 401 })), /sesión venció/);
  assert.deepEqual(await readStaffResponse(new Response('{"ok":true}')), { ok: true });
});
