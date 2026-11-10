import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeReceipts,
  receiptFileName,
  buildReceiptsCsv,
  buildAccountantEmail,
  rangeLabel,
  nextAccountantSendKey,
} from "../utils/accountantReport.js";
import { parseReceiptMeta, detectImageType } from "../controllers/receiptController.js";
import { cloudinaryResizedUrl } from "../utils/cloudinary.js";

const receipt = (overrides = {}) => ({
  kind: "ticket",
  paymentMethod: "efectivo",
  amount: 100,
  date: "2026-11-03",
  vendor: "",
  note: "",
  imageUrl: "https://res.cloudinary.com/demo/image/upload/v1/comprobantes/a.jpg",
  ...overrides,
});

test("el resumen del contador suma por forma de pago y cuenta los que no traen monto", () => {
  const summary = summarizeReceipts([
    receipt({ amount: 120.1 }),
    receipt({ amount: 79.9 }),
    receipt({ paymentMethod: "tarjeta", kind: "factura", amount: 500 }),
    receipt({ paymentMethod: null, amount: null }),
  ]);

  assert.equal(summary.count, 4);
  assert.equal(summary.total, 700);
  assert.equal(summary.withoutAmount, 1);
  assert.deepEqual(summary.byPaymentMethod.efectivo, { count: 2, total: 200 });
  assert.deepEqual(summary.byPaymentMethod.tarjeta, { count: 1, total: 500 });
  assert.deepEqual(summary.byPaymentMethod.sin_dato, { count: 1, total: 0 });
  assert.deepEqual(summary.byKind.factura, { count: 1, total: 500 });
});

test("el nombre de cada foto empieza con su número y no lleva acentos ni espacios", () => {
  const name = receiptFileName(receipt({ kind: "factura", vendor: "Pescadería Ñandú S.A." }), 0);
  assert.equal(name, "01_2026-11-03_factura_efectivo_pescaderia-nandu-s-a.jpg");
  assert.equal(receiptFileName(receipt({ paymentMethod: null }), 11), "12_2026-11-03_ticket_sin-pago.jpg");
});

test("el CSV abre bien en Excel y no ejecuta fórmulas capturadas por el equipo", () => {
  const files = [
    { receipt: receipt({ vendor: "=HYPERLINK(\"x\")", note: "gas, cilindro" }), name: "01.jpg" },
  ];
  const csv = buildReceiptsCsv(files);
  assert.ok(csv.startsWith("﻿#,Fecha,Tipo"));
  const [, row] = csv.slice(1).split("\r\n");
  assert.ok(row.includes(`"'=HYPERLINK(""x"")"`), row);
  assert.ok(row.includes(`"gas, cilindro"`), row);
  assert.ok(row.includes(",100,"), row);
});

test("el correo escapa lo que captura el equipo y explica qué fotos van adjuntas", () => {
  const files = [
    { receipt: receipt({ vendor: "<script>alert(1)</script>" }), name: "01.jpg" },
    { receipt: receipt({ paymentMethod: "tarjeta" }), name: "02.jpg" },
  ];
  const { subject, html } = buildAccountantEmail({
    files,
    periodLabel: "de la semana del 2 al 8 de noviembre de 2026",
    attachedNames: new Set(["01.jpg"]),
  });

  assert.equal(subject, "Poke Palace — comprobantes de la semana del 2 al 8 de noviembre de 2026");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("1 fotos van adjuntas; las otras 1"));
  assert.ok(html.includes("Efectivo") && html.includes("Tarjeta"));
});

test("las semanas se nombran en español, también si cruzan de mes", () => {
  assert.equal(rangeLabel("2026-11-02", "2026-11-08"), "del 2 al 8 de noviembre de 2026");
  assert.equal(rangeLabel("2026-11-30", "2026-12-06"), "del 30 de noviembre al 6 de diciembre de 2026");
  assert.equal(rangeLabel("2026-12-28", "2027-01-03"), "del 28 de diciembre de 2026 al 3 de enero de 2027");
});

test("el siguiente envío es el lunes de esta semana hasta que se manda, luego el siguiente", () => {
  // Miércoles 11 nov 2026, mediodía en Tijuana.
  const wednesday = new Date("2026-11-11T20:00:00Z");
  assert.equal(nextAccountantSendKey(null, wednesday), "2026-11-09");
  assert.equal(nextAccountantSendKey("2026-11-02", wednesday), "2026-11-09");
  assert.equal(nextAccountantSendKey("2026-11-09", wednesday), "2026-11-16");
});

test("los datos del comprobante se validan antes de subir la foto", () => {
  const today = "2026-11-10";
  assert.equal(parseReceiptMeta({ kind: "pizza" }, today).error, "Tipo de comprobante inválido");
  assert.equal(parseReceiptMeta({ kind: ["factura", "ticket"] }, today).error, "Tipo de comprobante inválido");
  assert.equal(parseReceiptMeta({ paymentMethod: "bitcoin" }, today).error, "Forma de pago inválida");
  assert.equal(parseReceiptMeta({ amount: ["5"] }, today).error, "El monto no es válido");
  assert.equal(parseReceiptMeta({ amount: "-3" }, today).error, "El monto no es válido");
  assert.equal(parseReceiptMeta({ date: "2026-11-11" }, today).error, "La fecha no puede ser de un día que no ha llegado");
  assert.equal(parseReceiptMeta({ date: "2026-02-30" }, today).error, "La fecha no es válida");
  assert.equal(parseReceiptMeta({ registerExpense: "true" }, today).error, "Para anotarlo como gasto escribe el monto");
  assert.equal(
    parseReceiptMeta({ registerExpense: "true", amount: "50", category: "Pizza" }, today).error,
    "Categoría de gasto inválida"
  );

  assert.deepEqual(
    parseReceiptMeta({
      kind: "factura", paymentMethod: "tarjeta", amount: "1234.567", date: "2026-11-09",
      vendor: "  Costco ", note: "", registerExpense: "true", category: "Ingredientes",
    }, today),
    {
      kind: "factura", paymentMethod: "tarjeta", amount: 1234.57, date: "2026-11-09",
      vendor: "Costco", note: "", registerExpense: true, category: "Ingredientes",
    }
  );
  // Sin nada: ticket de hoy, sin forma de pago ni monto.
  const defaults = parseReceiptMeta({}, today);
  assert.equal(defaults.kind, "ticket");
  assert.equal(defaults.date, today);
  assert.equal(defaults.paymentMethod, null);
  assert.equal(defaults.amount, null);
});

test("solo se aceptan imágenes reales, sin importar el Content-Type", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);
  assert.equal(detectImageType(jpeg), "image/jpeg");
  assert.equal(detectImageType(png), "image/png");
  assert.equal(detectImageType(webp), "image/webp");
  assert.equal(detectImageType(Buffer.from("%PDF-1.7 hello world")), null);
  assert.equal(detectImageType({}), null);
});

test("las fotos se adjuntan en versión ligera de Cloudinary", () => {
  assert.equal(
    cloudinaryResizedUrl("https://res.cloudinary.com/demo/image/upload/v17/comprobantes/abc.jpg"),
    "https://res.cloudinary.com/demo/image/upload/c_limit,w_1600,q_auto:good,f_jpg/v17/comprobantes/abc.jpg"
  );
  assert.equal(cloudinaryResizedUrl("https://example.com/a.jpg"), "https://example.com/a.jpg");
});
