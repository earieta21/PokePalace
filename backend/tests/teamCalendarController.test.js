import { test } from "node:test";
import assert from "node:assert/strict";
import CalendarEntry from "../models/CalendarEntry.js";
import StaffUser from "../models/StaffUser.js";
import { createCalendarEntry, deleteCalendarEntry, getCalendar, updateCalendarEntry } from "../controllers/staffCalendarController.js";

const creatorId = "a".repeat(24);
const assigneeId = "b".repeat(24);
const eventId = "c".repeat(24);
const entry = { _id: eventId, locationId: "main", createdBy: creatorId, createdByName: "Ana", assigneeId,
  assigneeName: "Luis", title: "Preparar pedido", description: "", type: "task", startDate: "2026-11-10",
  endDate: "2026-11-10", startTime: "", endTime: "", priority: "normal", status: "pending", __v: 2 };
const req = (overrides = {}) => ({ staff: { id: creatorId, name: "Ana", role: "employee", locationId: "main" },
  query: { locationId: "main" }, params: { id: eventId }, body: { version: 2 }, ...overrides });
const response = () => ({ code: 200, data: null, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });
const lean = (value) => ({ lean: async () => value });

test("consulta incluye eventos que atraviesan el mes y separa vencidos, sin exponer datos privados del personal", async (t) => {
  const queries = [];
  t.mock.method(CalendarEntry, "find", (scope) => {
    queries.push(scope);
    return { sort: () => ({ limit: () => lean(scope.status ? [] : [entry]) }) };
  });
  t.mock.method(StaffUser, "find", (scope) => {
    assert.deepEqual(scope, { locationId: "main", active: true });
    return { select: (projection) => {
      assert.equal(projection, "_id name color");
      return { sort: () => lean([{ _id: creatorId, name: "Ana" }]) };
    } };
  });
  const res = response();
  await getCalendar(req({ query: { locationId: "main", from: "2026-11-01", to: "2026-11-30" } }), res);
  assert.equal(res.code, 200);
  assert.deepEqual(queries[0], { locationId: "main", startDate: { $lte: "2026-11-30" }, endDate: { $gte: "2026-11-01" } });
  assert.equal(queries[1].locationId, "main");
  assert.equal(queries[1].status, "pending");
  assert.deepEqual(queries[1].type, { $in: ["task", "maintenance"] });
  assert.equal(res.data.events.length, 1);
  assert.equal(res.data.people.length, 1);
  assert.deepEqual(res.data.overdue, []);
});

test("calendario rechaza consultas y escrituras de otra sucursal antes de tocar la base", async (t) => {
  const spy = t.mock.method(CalendarEntry, "findOne", () => { throw new Error("No debe consultar"); });
  for (const action of [getCalendar, createCalendarEntry, updateCalendarEntry, deleteCalendarEntry]) {
    const res = response();
    await action(req({ query: { locationId: "other" } }), res);
    assert.equal(res.code, 403);
  }
  assert.equal(spy.mock.callCount(), 0);
});

test("calendario no permite que un compañero edite o borre eventos ajenos", async (t) => {
  t.mock.method(CalendarEntry, "findOne", () => lean(entry));
  for (const action of [updateCalendarEntry, deleteCalendarEntry]) {
    const res = response();
    await action(req({ staff: { id: "d".repeat(24), role: "employee", locationId: "main" }, body: { version: 2, title: "Cambio ajeno" } }), res);
    assert.equal(res.code, 403);
  }
});

test("responsable completa un pendiente ajeno pero no altera sus otros campos", async (t) => {
  t.mock.method(CalendarEntry, "findOne", () => lean(entry));
  let written;
  t.mock.method(CalendarEntry, "findOneAndUpdate", async (scope, update) => {
    written = { scope, update };
    return { ...entry, ...update.$set, __v: 3 };
  });
  const staff = { id: assigneeId, role: "kitchen", locationId: "main" };
  const res = response();
  await updateCalendarEntry(req({ staff, body: { version: 2, status: "done" } }), res);
  assert.equal(res.code, 200);
  assert.equal(res.data.event.status, "done");
  assert.ok(written.update.$set.completedAt instanceof Date);
  assert.deepEqual(written.scope, { _id: eventId, locationId: "main", __v: 2 });
  assert.deepEqual(written.update.$inc, { __v: 1 });
  const forbidden = response();
  await updateCalendarEntry(req({ staff, body: { version: 2, status: "done", title: "Nuevo título" } }), forbidden);
  assert.equal(forbidden.code, 403);
});

test("calendario rechaza ediciones obsoletas y eliminaciones que perderían cambios ajenos", async (t) => {
  t.mock.method(CalendarEntry, "findOne", () => lean(entry));
  t.mock.method(CalendarEntry, "findOneAndUpdate", async () => null);
  t.mock.method(CalendarEntry, "deleteOne", async (scope) => {
    assert.equal(scope.__v, 1);
    assert.equal(scope.locationId, "main");
    return { deletedCount: 0 };
  });
  const update = response();
  await updateCalendarEntry(req({ body: { version: 1, title: "Edición vieja" } }), update);
  assert.equal(update.code, 409);
  const remove = response();
  await deleteCalendarEntry(req({ body: { version: 1 } }), remove);
  assert.equal(remove.code, 409);
});

test("cada integrante registra solo sus ausencias y el servidor verifica al responsable", async (t) => {
  t.mock.method(CalendarEntry, "findOne", () => lean(null));
  const staffQuery = t.mock.method(StaffUser, "findOne", (scope) => {
    assert.equal(scope.locationId, "main");
    assert.equal(scope.active, true);
    return { select: () => lean(null) };
  });
  const body = { ...entry, clientRequestId: "calendar:test-00000001", type: "absence", assigneeId };
  const absence = response();
  await createCalendarEntry(req({ body }), absence);
  assert.equal(absence.code, 403);
  assert.equal(staffQuery.mock.callCount(), 0);
  const invalidPerson = response();
  await createCalendarEntry(req({ body: { ...body, type: "task" } }), invalidPerson);
  assert.equal(invalidPerson.code, 400);
});

test("crear de nuevo con el mismo identificador devuelve el evento sin duplicarlo", async (t) => {
  t.mock.method(CalendarEntry, "findOne", () => lean(entry));
  const create = t.mock.method(CalendarEntry, "create", () => { throw new Error("No debe duplicar"); });
  const res = response();
  await createCalendarEntry(req({ body: { clientRequestId: "calendar:test-00000001" } }), res);
  assert.equal(res.code, 200);
  assert.equal(res.data.event._id, eventId);
  assert.equal(create.mock.callCount(), 0);
});

test("crear ignora identidad y sucursal inyectadas y usa los datos autenticados", async (t) => {
  t.mock.method(CalendarEntry, "findOne", () => lean(null));
  t.mock.method(StaffUser, "findOne", () => ({ select: () => lean({ _id: assigneeId, name: "Luis" }) }));
  t.mock.method(CalendarEntry, "create", async (body) => ({ ...body, _id: eventId }));
  const res = response();
  await createCalendarEntry(req({ body: { ...entry, clientRequestId: "calendar:test-00000002",
    locationId: "other", createdBy: assigneeId, createdByName: "Falso", assigneeName: "Falso" } }), res);
  assert.equal(res.code, 201);
  assert.equal(res.data.event.locationId, "main");
  assert.equal(res.data.event.createdBy, creatorId);
  assert.equal(res.data.event.createdByName, "Ana");
  assert.equal(res.data.event.assigneeName, "Luis");
});
