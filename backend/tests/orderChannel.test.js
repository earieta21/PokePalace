import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IS_KIOSK_ORDER_EXPR,
  KIOSK_WITHOUT_PHONE_SINCE,
  ORDER_CHANNEL_EXPR,
  buildKioskWeeks,
} from "../utils/orderChannel.js";
import { dateKeyInTimeZone, mondayOfDateKey, shiftDateKey } from "../utils/timeZone.js";
import {
  KIOSK_WITHOUT_PHONE_SINCE as PORTAL_KIOSK_SINCE,
  orderChannel,
  orderChannelLabel,
} from "../../src/data/orderChannels.js";

/* Evalúa las expresiones de agregación de utils/orderChannel.js sobre un
   documento, con la semántica de Mongo para los operadores que usan. Sirve
   para comprobar aquí que Ventas (Mongo) y el portal (JS) cuentan igual; la
   prueba contra Mongo de verdad está en api.test.js. */
const MISSING = Symbol("missing");
function evaluate(expr, doc) {
  if (typeof expr === "string" && expr.startsWith("$")) {
    return Object.hasOwn(doc, expr.slice(1)) ? doc[expr.slice(1)] : MISSING;
  }
  if (Array.isArray(expr)) return expr.map((item) => evaluate(item, doc));
  if (expr === null || typeof expr !== "object" || expr instanceof Date) return expr;
  const [op, args] = Object.entries(expr)[0];
  const value = (index) => evaluate(args[index], doc);
  const comparable = (v) => (v instanceof Date ? v.getTime() : v);
  switch (op) {
    case "$or": return args.some((arg) => evaluate(arg, doc) === true);
    case "$and": return args.every((arg) => evaluate(arg, doc) === true);
    case "$eq": return comparable(value(0)) === comparable(value(1));
    case "$gte": {
      const [left, right] = [value(0), value(1)];
      if (left === MISSING || left === null) return false;
      return comparable(left) >= comparable(right);
    }
    case "$in": return value(1).includes(value(0));
    case "$type": {
      const v = evaluate(args, doc);
      if (v === MISSING) return "missing";
      if (v === null) return "null";
      return typeof v === "boolean" ? "bool" : typeof v;
    }
    case "$ifNull": {
      const v = value(0);
      return v === MISSING || v === null ? value(1) : v;
    }
    case "$cond": return value(0) === true ? value(1) : value(2);
    default: throw new Error(`Operador sin soporte en la prueba: ${op}`);
  }
}

const afterFlag = new Date("2026-10-01T19:00:00Z");
const beforeKioskStoppedAskingPhone = new Date("2026-09-01T19:00:00Z");

// Pedidos como los guarda el servidor (con teléfono siempre como texto).
const CASES = [
  ["kiosco con la marca", { source: "online", fromKiosk: true, phone: "", createdAt: afterFlag }, "kiosk"],
  ["web con la marca", { source: "online", fromKiosk: false, phone: "6630000000", createdAt: afterFlag }, "online"],
  ["kiosco de antes de la marca", { source: "online", phone: "", createdAt: afterFlag }, "kiosk"],
  ["web de antes de la marca", { source: "online", phone: "6630000000", createdAt: afterFlag }, "online"],
  ["sin teléfono antes del 13 sep", { source: "online", phone: "", createdAt: beforeKioskStoppedAskingPhone }, "online"],
  ["POS sin teléfono", { source: "pos", phone: "", createdAt: afterFlag }, "pos"],
  ["WhatsApp", { source: "whatsapp", phone: "6630000000", createdAt: afterFlag }, "whatsapp"],
  ["delivery", { source: "delivery", phone: "", createdAt: afterFlag }, "delivery"],
];

test("Ventas (Mongo) y el portal reconocen igual cada canal", () => {
  for (const [name, doc, expected] of CASES) {
    assert.equal(evaluate(ORDER_CHANNEL_EXPR, doc), expected, `Ventas: ${name}`);
    assert.equal(evaluate(IS_KIOSK_ORDER_EXPR, doc), expected === "kiosk", `Ventas (kiosco): ${name}`);
    // El portal recibe createdAt como texto ISO.
    assert.equal(orderChannel({ ...doc, createdAt: doc.createdAt.toISOString() }), expected, `portal: ${name}`);
  }
});

test("el portal no adivina kiosco si el servidor no mandó el teléfono", () => {
  // Cocina y "Por cobrar" no reciben el teléfono: un pedido viejo se queda en línea.
  assert.equal(orderChannel({ source: "online", createdAt: afterFlag.toISOString() }), "online");
  assert.equal(orderChannelLabel({ source: "online", fromKiosk: true }), "Kiosco");
  assert.equal(orderChannelLabel({ source: "online", fromKiosk: false }), "En línea");
  assert.equal(orderChannelLabel({ source: "delivery" }), "Delivery");
  assert.equal(orderChannelLabel({ source: "nuevo" }), "nuevo");
  assert.equal(orderChannelLabel(null), "");
});

test("la fecha de corte es la misma en Ventas y en el portal: 13 sep 2026 a medianoche en Tijuana", () => {
  assert.equal(KIOSK_WITHOUT_PHONE_SINCE.getTime(), PORTAL_KIOSK_SINCE);
  assert.equal(dateKeyInTimeZone(KIOSK_WITHOUT_PHONE_SINCE), "2026-09-13");
  assert.equal(dateKeyInTimeZone(new Date(PORTAL_KIOSK_SINCE - 1)), "2026-09-12");
});

test("las semanas van de lunes a domingo", () => {
  assert.equal(mondayOfDateKey("2026-11-18"), "2026-11-16"); // miércoles
  assert.equal(mondayOfDateKey("2026-11-16"), "2026-11-16"); // lunes
  assert.equal(mondayOfDateKey("2026-11-22"), "2026-11-16"); // domingo
  assert.equal(mondayOfDateKey("2026-11-01"), "2026-10-26"); // cambio de mes
  assert.equal(mondayOfDateKey("2027-01-01"), "2026-12-28"); // cambio de año
  assert.equal(shiftDateKey("2026-11-02", -7), "2026-10-26");
  assert.equal(shiftDateKey("2026-12-28", 6), "2027-01-03");
});

test("el kiosco por semana suma cada día en su semana y deja la actual al final", () => {
  const rows = [
    { _id: { day: "2026-11-17", kiosk: true }, count: 3, paidCount: 2, revenue: 460.1 },
    { _id: { day: "2026-11-18", kiosk: true }, count: 1, paidCount: 1, revenue: 230.2 },
    { _id: { day: "2026-11-17", kiosk: false }, count: 7, paidCount: 7, revenue: 1800 },
    { _id: { day: "2026-11-08", kiosk: true }, count: 1, paidCount: 0, revenue: 0 }, // domingo
    { _id: { day: "2026-11-02", kiosk: false }, count: 4, paidCount: 4, revenue: 900 },
    { _id: { day: "2026-10-30", kiosk: true }, count: 9, paidCount: 9, revenue: 999 }, // fuera
  ];
  const weeks = buildKioskWeeks(rows, "2026-11-18", 3);

  assert.deepEqual(weeks.map((week) => [week.weekStart, week.weekEnd, week.current]), [
    ["2026-11-02", "2026-11-08", false],
    ["2026-11-09", "2026-11-15", false],
    ["2026-11-16", "2026-11-22", true],
  ]);
  assert.deepEqual(
    weeks.map(({ orders, paidOrders, revenue, allOrders }) => ({ orders, paidOrders, revenue, allOrders })),
    [
      { orders: 1, paidOrders: 0, revenue: 0, allOrders: 5 },
      { orders: 0, paidOrders: 0, revenue: 0, allOrders: 0 },
      { orders: 4, paidOrders: 3, revenue: 690.3, allOrders: 11 },
    ]
  );
  assert.equal(buildKioskWeeks([], "2026-11-18").length, 8);
});
