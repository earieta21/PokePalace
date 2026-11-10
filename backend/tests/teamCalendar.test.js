import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarEntryError, calendarRangeError, canCompleteCalendarEntry, canEditCalendarEntry, isCalendarDate,
} from "../utils/teamCalendar.js";
import {
  absenceConflicts, canComplete, canEdit, formatDay, matchesCalendarFilters, monthDays, shiftDay, shiftMonth, spansDay,
} from "../../src/utils/teamCalendar.js";

const valid = { title: "Revisar refrigerador", description: "", type: "maintenance", startDate: "2026-11-10",
  endDate: "2026-11-10", startTime: "09:00", endTime: "10:00", priority: "normal", status: "pending",
  createdBy: "creator", assigneeId: "person" };

test("calendario valida fechas reales, años bisiestos y periodos inclusivos", () => {
  assert.equal(isCalendarDate("2028-02-29"), true);
  for (const value of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-2-01", null, {}, "1999-12-31"]) {
    assert.equal(isCalendarDate(value), false);
  }
  assert.equal(calendarRangeError("2026-11-10", "2026-11-10"), null);
  assert.ok(calendarRangeError("2026-11-11", "2026-11-10"));
  assert.ok(calendarRangeError("2026-01-01", "2027-11-10"));
  assert.ok(calendarRangeError("2026-01-01", "2026-05-01", 93));
});

test("calendario rechaza datos inválidos y permite reuniones de varios días", () => {
  assert.equal(calendarEntryError(valid), null);
  for (const patch of [
    { title: " " }, { title: "x".repeat(121) }, { title: {} }, { description: null },
    { description: "x".repeat(2001) }, { type: "vacation" }, { priority: "urgent" }, { status: "approved" },
    { startTime: "25:00" }, { endTime: "09:00" }, { startTime: "", endTime: "10:00" },
    { type: "absence" }, { type: "meeting", status: "done" },
  ]) assert.ok(calendarEntryError({ ...valid, ...patch }), JSON.stringify(patch));
  assert.equal(calendarEntryError({ ...valid, type: "absence", startTime: "", endTime: "" }), null);
  assert.equal(calendarEntryError({ ...valid, type: "meeting", endDate: "2026-11-11", endTime: "08:00" }), null);
});

test("calendario limita edición al creador/gerencia y permite completar al responsable", () => {
  for (const [user, edit, complete] of [
    [{ id: "creator", role: "employee" }, true, true],
    [{ id: "person", role: "employee" }, false, true],
    [{ id: "stranger", role: "employee" }, false, false],
    [{ id: "manager", role: "manager" }, true, true],
    [{ id: "admin", role: "admin" }, true, true],
    [{ id: "owner", role: "owner" }, true, true],
  ]) {
    assert.equal(canEditCalendarEntry(user, valid), edit);
    assert.equal(canCompleteCalendarEntry(user, valid), complete);
    // The UI must expose exactly the same actions as the server.
    assert.equal(canEdit(user, valid), edit);
    assert.equal(canComplete(user, valid), complete);
    assert.equal(canCompleteCalendarEntry(user, { ...valid, type: "absence" }), false);
    assert.equal(canComplete(user, { ...valid, type: "meeting" }), false);
  }
});

test("calendario conserva los días en Tijuana al cruzar meses, años y cambios de hora", () => {
  assert.equal(shiftMonth("2026-12-01", 1), "2027-01-01");
  assert.equal(shiftMonth("2026-01-01", -1), "2025-12-01");
  assert.equal(shiftDay("2028-02-28", 1), "2028-02-29");
  assert.equal(shiftDay("2026-11-01", 1), "2026-11-02");
  const days = monthDays("2026-11-01");
  assert.equal(days.length, 42);
  assert.equal(days[0], "2026-10-26");
  assert.equal(days[41], "2026-12-06");
  assert.equal(new Set(days).size, 42);
  assert.match(formatDay("2026-11-01", { day: "numeric", month: "long" }), /1 de noviembre/);
});

test("ausencias atraviesan meses y advierten solo los pendientes del mismo responsable", () => {
  const absence = { type: "absence", assigneeId: "person", startDate: "2026-10-30", endDate: "2026-11-10" };
  assert.equal(spansDay(absence, "2026-10-30"), true);
  assert.equal(spansDay(absence, "2026-11-10"), true);
  assert.equal(spansDay(absence, "2026-11-11"), false);
  assert.deepEqual(absenceConflicts(valid, [absence]), [absence]);
  assert.deepEqual(absenceConflicts({ ...valid, assigneeId: "someone-else" }, [absence]), []);
  assert.deepEqual(absenceConflicts({ ...valid, status: "done" }, [absence]), []);
  assert.deepEqual(absenceConflicts({ ...valid, startDate: "2026-11-11", endDate: "2026-11-12" }, [absence]), []);
});

test("filtros del calendario combinan responsable, tipo, acentos y completados", () => {
  const filters = { type: "", person: "", search: "", showDone: false };
  const entry = { ...valid, title: "Reunión de preparación", assigneeName: "José" };
  assert.equal(matchesCalendarFilters(entry, { ...filters, search: " JOSE " }), true);
  assert.equal(matchesCalendarFilters(entry, { ...filters, search: "preparacion" }), true);
  assert.equal(matchesCalendarFilters(entry, { ...filters, type: "absence" }), false);
  assert.equal(matchesCalendarFilters(entry, { ...filters, person: "other" }), false);
  assert.equal(matchesCalendarFilters(entry, { ...filters, person: "person", type: "maintenance" }), true);
  assert.equal(matchesCalendarFilters({ ...entry, status: "done" }, filters), false);
  assert.equal(matchesCalendarFilters({ ...entry, status: "done" }, { ...filters, showDone: true }), true);
});
