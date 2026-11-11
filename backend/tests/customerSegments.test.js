import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCustomerDirectory,
  customerFlags,
  maskRewardCode,
  pointsExpiryDate,
  summarizeCustomerBase,
  summarizeCustomerOrders,
} from "../utils/customerSegments.js";

const NOW = new Date("2026-11-11T18:00:00.000Z");
const daysAgo = (days) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const customer = (overrides = {}) => ({
  _id: overrides._id || `id-${Math.random().toString(16).slice(2)}`,
  name: "Cliente",
  email: "cliente@example.test",
  points: 0,
  lifetimePoints: 0,
  pointsLastEarnedAt: null,
  createdAt: daysAgo(200),
  ...overrides,
});

test("los segmentos se calculan con las compras pagadas de cada cliente", () => {
  const recent = customerFlags(customer({ createdAt: daysAgo(3) }), null, NOW);
  assert.equal(recent.new, true);
  assert.equal(recent.never, true);
  assert.equal(recent.dormant, false);

  const regular = customerFlags(
    customer(),
    { purchaseCount: 9, lastPurchaseAt: daysAgo(2), recentPurchaseCount: 3 },
    NOW
  );
  assert.equal(regular.frequent, true);
  assert.equal(regular.dormant, false);
  assert.equal(regular.never, false);

  const lapsed = customerFlags(
    customer(),
    { purchaseCount: 4, lastPurchaseAt: daysAgo(45), recentPurchaseCount: 0 },
    NOW
  );
  assert.equal(lapsed.dormant, true);
  assert.equal(lapsed.frequent, false);

  assert.equal(customerFlags(customer({ lifetimePoints: 300 }), null, NOW).gold, true);
  assert.equal(customerFlags(customer({ lifetimePoints: 299 }), null, NOW).gold, false);
});

test("los puntos vencen 12 meses después de la última vez que ganó, y se avisa 60 días antes", () => {
  const earned = new Date("2025-12-20T12:00:00.000Z");
  const withPoints = customer({ points: 80, pointsLastEarnedAt: earned });
  assert.equal(pointsExpiryDate(withPoints).toISOString(), "2026-12-20T12:00:00.000Z");
  assert.equal(customerFlags(withPoints, null, NOW).expiring, true);

  const safe = customer({ points: 80, pointsLastEarnedAt: new Date("2026-06-01T12:00:00.000Z") });
  assert.equal(customerFlags(safe, null, NOW).expiring, false);

  // Sin saldo o sin fecha de último punto no hay nada que venza.
  assert.equal(pointsExpiryDate(customer({ points: 0, pointsLastEarnedAt: earned })), null);
  assert.equal(pointsExpiryDate(customer({ points: 50, pointsLastEarnedAt: null })), null);
});

test("el directorio cuenta cada segmento, filtra y ordena", () => {
  const big = customer({ _id: "big", name: "Gasta mucho", createdAt: daysAgo(100) });
  const small = customer({ _id: "small", name: "Gasta poco", createdAt: daysAgo(50) });
  const newbie = customer({ _id: "newbie", name: "Recién llegado", createdAt: daysAgo(1) });
  const stats = new Map([
    ["big", { purchaseCount: 10, totalSpent: 3000, lastPurchaseAt: daysAgo(40), recentPurchaseCount: 1 }],
    ["small", { purchaseCount: 2, totalSpent: 400, lastPurchaseAt: daysAgo(35), recentPurchaseCount: 2 }],
  ]);

  const all = buildCustomerDirectory([big, small, newbie], stats, { now: NOW });
  assert.deepEqual(all.rows.map((row) => row._id), ["newbie", "small", "big"]);
  assert.equal(all.counts.all, 3);
  assert.equal(all.counts.dormant, 2);
  assert.equal(all.counts.never, 1);
  assert.equal(all.counts.new, 1);
  assert.equal(all.rows.find((row) => row._id === "big").totalSpent, 3000);
  assert.deepEqual(all.rows.find((row) => row._id === "newbie").tags, ["new", "never"]);

  const dormant = buildCustomerDirectory([big, small, newbie], stats, { segment: "dormant", sort: "spent", now: NOW });
  assert.deepEqual(dormant.rows.map((row) => row._id), ["big", "small"]);
  // Los conteos de los botones no dependen del filtro elegido.
  assert.equal(dormant.counts.all, 3);

  const lastPurchase = buildCustomerDirectory([big, small, newbie], stats, { sort: "lastPurchase", now: NOW });
  assert.deepEqual(lastPurchase.rows.map((row) => row._id), ["small", "big", "newbie"]);

  const unknown = buildCustomerDirectory([big], stats, { segment: "$where", sort: "nope", now: NOW });
  assert.equal(unknown.rows.length, 1);
});

test("lo que más pide se cuenta sin repetir el primer bowl de los carritos", () => {
  const summary = summarizeCustomerOrders([
    {
      source: "online",
      // Los campos planos repiten el primer bowl del carrito: no deben contarse.
      base: "white-rice",
      proteins: ["salmon"],
      cartItems: [
        { kind: "bowl", proteins: ["salmon", "tuna"], qty: 1 },
        { kind: "item", name: "Agua del día", qty: 2 },
        { kind: "promo2x1", protein: "salmon", qty: 1 },
      ],
    },
    {
      source: "pos",
      base: "quinoa",
      proteins: ["salmon"],
      items: [
        { name: "Agua del día", qty: 1 },
        { name: "Bowl mediano", qty: 1, proteins: ["shrimp"] },
      ],
    },
    { source: "pos", items: [{ name: "The OG", qty: 1 }] },
  ]);

  assert.deepEqual(summary.topProteins, [
    { key: "salmon", count: 3 },
    { key: "shrimp", count: 1 },
    { key: "tuna", count: 1 },
  ]);
  assert.deepEqual(summary.topItems[0], { key: "Agua del día", count: 3 });
  assert.equal(summary.topItems.find((item) => item.key === "Bowl personalizado").count, 2);
  assert.deepEqual(summary.bySource, { online: 1, pos: 2 });
  assert.deepEqual(summarizeCustomerOrders([]), { topProteins: [], topItems: [], bySource: {} });
});

test("los indicadores separan cuentas nuevas, compradores, repetidores y ventas con y sin cuenta", () => {
  const monthStart = new Date("2026-11-01T07:00:00.000Z");
  const previousMonthStart = new Date("2026-10-01T07:00:00.000Z");
  const customers = [
    customer({ _id: "a", createdAt: new Date("2026-11-05T12:00:00.000Z") }),
    customer({ _id: "b", createdAt: new Date("2026-10-20T12:00:00.000Z") }),
    // 1 nov a las 5 a.m. UTC sigue siendo 31 de octubre en Tijuana.
    customer({ _id: "c", createdAt: new Date("2026-11-01T05:00:00.000Z") }),
    customer({ _id: "d", createdAt: new Date("2026-06-01T12:00:00.000Z") }),
  ];
  const summary = summarizeCustomerBase(customers, [
    { _id: "a", purchaseCount: 1, windowOrders: 1, windowRevenue: 200 },
    { _id: "b", purchaseCount: 4, windowOrders: 2, windowRevenue: 300 },
    { _id: "c", purchaseCount: 2, windowOrders: 0, windowRevenue: 0 },
    // Cuenta borrada o de otro rol: cuenta como venta sin cuenta.
    { _id: "zzz", purchaseCount: 3, windowOrders: 1, windowRevenue: 100 },
    { _id: null, purchaseCount: 50, windowOrders: 4, windowRevenue: 400 },
  ], { monthStart, previousMonthStart });

  assert.deepEqual(summary.accounts, { total: 4, newThisMonth: 1, newLastMonth: 2 });
  assert.equal(summary.buyers, 3);
  assert.equal(summary.repeatBuyers, 2);
  assert.deepEqual(summary.sales.member, { orders: 3, revenue: 500, avgTicket: 166.67 });
  assert.deepEqual(summary.sales.guest, { orders: 5, revenue: 500, avgTicket: 100 });
  assert.equal(summary.sales.memberShare, 0.5);
  assert.equal(summary.sales.windowDays, 30);

  const empty = summarizeCustomerBase([], [], { monthStart, previousMonthStart });
  assert.deepEqual(empty.accounts, { total: 0, newThisMonth: 0, newLastMonth: 0 });
  assert.equal(empty.sales.member.avgTicket, null);
  assert.equal(empty.sales.memberShare, null);
});

test("el código del premio se muestra enmascarado", () => {
  assert.equal(maskRewardCode("PKP-AB12CD"), "••••12CD");
  assert.equal(maskRewardCode(null), null);
});
