import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Receipt from "../models/Receipt.js";
import Expense from "../models/Expense.js";
import ErrorLog from "../models/ErrorLog.js";
import ReceiptDelivery from "../models/ReceiptDelivery.js";
import StoreSettings from "../models/StoreSettings.js";
import StaffUser from "../models/StaffUser.js";
import express from "express";
import jwt from "jsonwebtoken";
import staffReceipts from "../routes/staffReceipts.js";
import { sanitizeMongo } from "../middleware/sanitizeMongo.js";
import { deleteReceipt, updateReceipt, uploadReceipt, listReceipts } from "../controllers/receiptController.js";
import { receiptListQuery } from "../utils/receiptQueries.js";
import { detectReceiptDocument, parseReceiptFiles, RECEIPT_BUNDLE_TYPE } from "../utils/receiptDocuments.js";
import { summarizeReceipts, buildAccountantEmail, buildReceiptsCsv, receiptDocumentEntries, sendReceiptsToAccountant } from "../utils/accountantReport.js";

const id = "a".repeat(24), expenseId = "b".repeat(24);
const receipt = { _id: id, date: "2020-01-01", amount: 100, vendor: "Costco", kind: "ticket", note: "", paymentMethod: "efectivo", source: "portal", locationId: "main", revision: 0, processing: null, sentToAccountantAt: null, imageUrl: "https://example.test/receipt.jpg" };
const expense = { _id: expenseId, date: receipt.date, amount: 100, description: "Costco", source: "manual", locationId: "main", updatedAt: new Date("2020-01-01") };
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
const xml = Buffer.from('<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Total="100"/>');
const req = (overrides = {}) => ({ params: { id }, query: {}, staff: { name: "Test", locationId: "main" }, body: { ...receipt, amount: "100" }, is: () => false, ...overrides });
const res = () => ({ code: 200, data: null, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });
const chain = (value) => ({ sort() { return this; }, select() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => value });
beforeEach((t) => { t.mock.method(ErrorLog, "findOneAndUpdate", async () => ({})); });

function fakeEnvironment(t) {
  for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "BREVO_API_KEY", "EMAIL_FROM"]) {
    const previous = process.env[key];
    process.env[key] = "receipt-test-only";
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

test("filtros literales, fechas válidas y paginación sin el límite de 300", () => {
  const result = receiptListQuery({ status: "pending", q: "CFE (casa).*", from: "2020-01-01", to: "2020-02-01", kind: "factura", paymentMethod: "tarjeta", offset: "350", incomplete: "true" });
  assert.equal(result.offset, 350);
  assert.equal(result.limit, 50);
  assert.equal(result.filter.amount, null);
  assert.equal(result.filter.sentToAccountantAt, null);
  const pattern = new RegExp(result.filter.$or[0].vendor.$regex, "i");
  assert.ok(pattern.test("CFE (casa).*"));
  assert.ok(!pattern.test("CFE casa123"));
  for (const query of [{ from: "2020-02-30" }, { from: "2020-02-01", to: "2020-01-01" }, { q: { $ne: "" } }, { offset: "-1" }, { status: "bad" }, { kind: ["ticket"] }]) assert.ok(receiptListQuery(query).error);
});

test("lista devuelve total y más páginas sin mezclar filtros con resumen global", async (t) => {
  t.mock.method(Receipt, "find", (filter) => {
    const result = chain(filter.kind ? [receipt] : [receipt, { ...receipt, amount: null }]);
    result.skip = (offset) => { assert.equal(offset, 350); return result; };
    return result;
  });
  t.mock.method(Receipt, "countDocuments", async (filter) => { assert.equal(filter.kind, "ticket"); return 402; });
  const response = res();
  await listReceipts(req({ query: { kind: "ticket", offset: "350" } }), response);
  assert.equal(response.data.total, 402);
  assert.equal(response.data.hasMore, true);
  assert.equal(response.data.pendingSummary.withoutAmount, 1);
});

test("resumen separa compras, vouchers y otros; no convierte faltantes en cero capturado", () => {
  const result = summarizeReceipts([receipt, { ...receipt, kind: "factura", amount: null }, { ...receipt, kind: "voucher", amount: 900 }, { ...receipt, kind: "otro", amount: 20 }]);
  assert.equal(result.groups.purchases.total, 100);
  assert.equal(result.groups.purchases.withoutAmount, 1);
  assert.equal(result.groups.vouchers.total, 900);
  assert.equal(result.groups.other.total, 20);
  const { html } = buildAccountantEmail({ files: [{ receipt, name: "ticket.jpg" }, { receipt: { ...receipt, kind: "voucher", amount: 900 }, name: "voucher.jpg" }], periodLabel: "prueba" });
  assert.match(html, /Compras \(facturas y tickets\)/);
  assert.match(html, /Vouchers de ventas/);
  assert.doesNotMatch(html, />Total<\/td>/);
});

test("paquetes admiten imágenes, PDF y XML; rechazan HTML, DTD y exceso de archivos", () => {
  assert.equal(detectReceiptDocument(pdf), "application/pdf");
  assert.equal(detectReceiptDocument(xml), "application/xml");
  assert.equal(detectReceiptDocument(Buffer.from('<!DOCTYPE foo><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"/>')), null);
  assert.equal(detectReceiptDocument(Buffer.from("<html>hola</html>")), null);
  const bundle = (files) => Buffer.from(JSON.stringify({ files: files.map((buffer) => ({ name: "test", content: buffer.toString("base64") })) }));
  assert.deepEqual(parseReceiptFiles(bundle([jpeg, pdf, xml]), true).map((f) => f.mimeType), ["image/jpeg", "application/pdf", "application/xml"]);
  assert.throws(() => parseReceiptFiles(bundle(Array(11).fill(jpeg)), true), /10 archivos/);
  assert.throws(() => parseReceiptFiles(Buffer.from('{"files":[{"content":"not base64"}]}'), true), /inválido/);
  assert.throws(() => parseReceiptFiles(Buffer.alloc(8 * 1024 * 1024 + 1)), /8 MB/);
  // A large valid base64 document must not exhaust the regexp call stack.
  const large = Buffer.concat([pdf.subarray(0, -5), Buffer.alloc(1024 * 1024, 32), Buffer.from("%%EOF")]);
  assert.equal(parseReceiptFiles(bundle([large]), true)[0].mimeType, "application/pdf");
});

test("correo y CSV incluyen cada archivo del mismo comprobante sin duplicar su monto", () => {
  const document = { ...receipt, documents: [{ url: "https://example.test/a.pdf", mimeType: "application/pdf" }, { url: "https://example.test/a.xml", mimeType: "application/xml" }] };
  const documents = receiptDocumentEntries(document, 0);
  assert.match(documents[0].name, /\.pdf$/);
  assert.match(documents[1].name, /_2\.xml$/);
  const files = [{ receipt: document, documents }];
  const { html } = buildAccountantEmail({ files, periodLabel: "prueba", attachedNames: new Set(documents.map((d) => d.name)) });
  assert.match(html, /1 comprobante/);
  assert.match(html, /a\.pdf/);
  assert.match(html, /a\.xml/);
  assert.match(html, /Todos los archivos van adjuntos/);
  assert.match(buildReceiptsCsv(files), /a\.pdf \| https:\/\/example.test\/a\.xml/);
});

test("edición obsoleta o en envío se rechaza sin tocar Finanzas", async (t) => {
  t.mock.method(Receipt, "findOneAndUpdate", (filter) => {
    assert.equal(filter.processing, null); assert.equal(filter.sentToAccountantAt, null);
    assert.deepEqual(filter.revision, { $in: [0, null] }); return chain(null);
  });
  const spy = t.mock.method(Expense, "updateOne", async () => { throw new Error("No debe modificar"); });
  const response = res(); await updateReceipt(req(), response);
  assert.equal(response.code, 409); assert.equal(spy.mock.callCount(), 0);
});

test("editar gasto creado sincroniza fecha, importe y descripción, y libera el bloqueo", async (t) => {
  const original = { ...receipt, expenseId, expenseMode: "created" };
  let claimed = false;
  t.mock.method(Receipt, "findOneAndUpdate", (_filter, update) => {
    if (!claimed) { claimed = true; return chain(original); }
    assert.equal(update.$inc.revision, 1);
    return chain({ ...original, ...update.$set, revision: 1 });
  });
  t.mock.method(Expense, "findById", () => chain({ ...expense, source: "comprobante" }));
  let saved;
  t.mock.method(Expense, "findOneAndUpdate", (_filter, update) => { saved = update.$set; return chain({ ...expense, ...saved }); });
  const released = t.mock.method(Receipt, "updateOne", async (_filter, update) => { assert.equal(update.$set.processing, null); });
  const response = res(); await updateReceipt(req({ body: { ...req().body, date: "2020-01-02", amount: "120", note: "hielo", expenseId } }), response);
  assert.equal(response.code, 200); assert.equal(saved.amount, 120); assert.equal(saved.date, "2020-01-02"); assert.equal(saved.description, "Costco — hielo"); assert.equal(released.mock.callCount(), 1);
});

test("si falla la escritura del comprobante se revierte solo la versión del gasto modificada", async (t) => {
  const original = { ...receipt, expenseId, expenseMode: "created" };
  const changedAt = new Date("2020-01-02");
  let claimed = false;
  t.mock.method(Receipt, "findOneAndUpdate", () => {
    if (!claimed) { claimed = true; return chain(original); }
    return { lean: async () => { throw new Error("falló guardar comprobante"); } };
  });
  t.mock.method(Receipt, "updateOne", async () => ({}));
  t.mock.method(Expense, "findById", () => chain({ ...expense, source: "comprobante" }));
  t.mock.method(Expense, "findOneAndUpdate", () => chain({ ...expense, amount: 125, updatedAt: changedAt }));
  let rollback;
  t.mock.method(Expense, "updateOne", async (filter, update) => { rollback = { filter, update }; return { matchedCount: 1 }; });
  const response = res(); await updateReceipt(req({ body: { ...req().body, amount: "125", expenseId } }), response);
  assert.equal(response.code, 500); assert.equal(rollback.filter.updatedAt, changedAt); assert.equal(rollback.update.$set.amount, 100);
});

test("vincular un gasto existente no crea ni reescribe el gasto", async (t) => {
  t.mock.method(Receipt, "findOneAndUpdate", (_filter, update) => chain({ ...receipt, ...update.$set }));
  t.mock.method(Receipt, "updateOne", async () => ({}));
  t.mock.method(Expense, "findOne", (filter) => { assert.equal(filter.locationId, "main"); return chain(expense); });
  const mutate = t.mock.method(Expense, "updateOne", async () => { throw new Error("No debe modificar"); });
  const response = res(); await updateReceipt(req({ body: { ...req().body, expenseId } }), response);
  assert.equal(response.code, 200); assert.equal(response.data.receipt.expenseMode, "existing"); assert.equal(mutate.mock.callCount(), 0);
});

test("vínculo con importe diferente se rechaza y libera el comprobante", async (t) => {
  t.mock.method(Receipt, "findOneAndUpdate", () => chain(receipt));
  t.mock.method(Expense, "findOne", () => chain(expense));
  const release = t.mock.method(Receipt, "updateOne", async () => ({}));
  const response = res(); await updateReceipt(req({ body: { ...req().body, amount: "101", expenseId } }), response);
  assert.equal(response.code, 400); assert.match(response.data.message, /coincidir/); assert.equal(release.mock.callCount(), 1);
});

test("borrar un comprobante vinculado conserva el gasto existente", async (t) => {
  const linked = { ...receipt, expenseId, expenseMode: "existing" };
  t.mock.method(Receipt, "findById", () => chain(linked));
  t.mock.method(Receipt, "findOneAndUpdate", () => chain(linked));
  t.mock.method(Receipt, "deleteOne", async (filter) => { assert.ok(filter.processing); return { deletedCount: 1 }; });
  t.mock.method(Receipt, "updateOne", async () => ({}));
  const spy = t.mock.method(Expense, "deleteOne", async () => { throw new Error("No debe borrar"); });
  const response = res(); await deleteReceipt(req(), response);
  assert.equal(response.code, 200); assert.equal(response.data.expenseRemoved, false); assert.equal(spy.mock.callCount(), 0);
});

test("un gasto compartido conserva su archivo aunque se borre el comprobante que lo creó", async (t) => {
  const original = { ...receipt, expenseId, expenseMode: "created", publicId: "photo" };
  t.mock.method(Receipt, "findById", () => chain(original));
  t.mock.method(Receipt, "findOneAndUpdate", () => chain(original));
  t.mock.method(Receipt, "deleteOne", async () => ({ deletedCount: 1 }));
  t.mock.method(Receipt, "updateOne", async () => ({}));
  t.mock.method(Receipt, "exists", async () => ({ _id: "other" }));
  const destroy = t.mock.method(globalThis, "fetch", async () => { throw new Error("No debe borrar archivos compartidos"); });
  const remove = t.mock.method(Expense, "deleteOne", async () => { throw new Error("No debe borrar gastos compartidos"); });
  const response = res(); await deleteReceipt(req(), response);
  assert.equal(response.code, 200); assert.equal(destroy.mock.callCount(), 0); assert.equal(remove.mock.callCount(), 0);
});

test("posibles duplicados se detectan antes de almacenar archivos", async (t) => {
  t.mock.method(Receipt, "exists", async () => ({ _id: id }));
  const spy = t.mock.method(globalThis, "fetch", async () => { throw new Error("No debe subir archivos"); });
  const response = res(); await uploadReceipt(req({ query: { date: receipt.date, amount: "100" }, body: jpeg }), response);
  assert.equal(response.code, 409); assert.equal(response.data.code, "POSSIBLE_DUPLICATE"); assert.equal(spy.mock.callCount(), 0);
});

test("subida de varias páginas guarda un único comprobante y conserva formatos originales", async (t) => {
  fakeEnvironment(t);
  const paths = [];
  t.mock.method(globalThis, "fetch", async (url) => { paths.push(url); return { ok: true, json: async () => ({ secure_url: `https://example.test/${paths.length}`, public_id: `file-${paths.length}` }) }; });
  let saved;
  t.mock.method(Receipt, "create", async (value) => { saved = value; return { ...value, _id: id }; });
  const body = Buffer.from(JSON.stringify({ files: [jpeg, pdf, xml].map((buffer, index) => ({ name: `file-${index}`, content: buffer.toString("base64") })) }));
  const response = res(); await uploadReceipt(req({ body, is: (type) => type === RECEIPT_BUNDLE_TYPE }), response);
  assert.equal(response.code, 201); assert.equal(saved.documents.length, 3);
  assert.match(paths[0], /\/image\/upload$/); assert.match(paths[1], /\/raw\/upload$/); assert.match(paths[2], /\/raw\/upload$/);
});

test("fallo de una página limpia los archivos subidos y no crea registros incompletos", async (t) => {
  fakeEnvironment(t);
  const paths = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    paths.push(url);
    if (paths.length === 2) throw new Error("upload falló");
    return { ok: true, json: async () => ({ secure_url: "https://example.test/first", public_id: "first", result: "ok" }) };
  });
  const spy = t.mock.method(Receipt, "create", async () => { throw new Error("No debe crear"); });
  const response = res();
  await uploadReceipt(req({ body: Buffer.from(JSON.stringify({ files: [pdf, xml].map((buffer) => ({ content: buffer.toString("base64") })) })), is: () => true }), response);
  assert.equal(response.code, 502); assert.equal(spy.mock.callCount(), 0); assert.match(paths[2], /\/raw\/destroy$/);
});

test("envío parcial guarda historial, libera pendientes y el reintento no repite los enviados", async (t) => {
  fakeEnvironment(t);
  const rows = Array.from({ length: 61 }, (_, index) => ({ ...receipt, _id: String(index), processing: null }));
  const matches = (row, filter) => (!filter._id?.$in || filter._id.$in.includes(row._id)) && (filter.processing === undefined || row.processing === filter.processing) && (filter.sentToAccountantAt === undefined || row.sentToAccountantAt === null);
  t.mock.method(Receipt, "countDocuments", async (filter) => rows.filter((r) => matches(r, filter)).length);
  t.mock.method(Receipt, "find", (filter) => {
    let selected = rows.filter((r) => matches(r, filter));
    const result = chain(null);
    result.limit = (n) => { selected = selected.slice(0, n); return result; };
    result.lean = async () => selected.map((r) => ({ ...r })); return result;
  });
  t.mock.method(Receipt, "updateMany", async (filter, update) => { rows.filter((r) => matches(r, filter)).forEach((r) => Object.assign(r, update.$set)); });
  t.mock.method(StoreSettings, "findOne", () => chain({ accountantEmails: ["test@example.test"] }));
  const history = [];
  t.mock.method(ReceiptDelivery, "create", async (value) => { const entry = { ...value, _id: String(history.length) }; history.push(entry); return entry; });
  t.mock.method(ReceiptDelivery, "updateOne", async (filter, update) => Object.assign(history.find((r) => r._id === filter._id), update.$set));
  t.mock.method(console, "error", () => {});
  let emailCalls = 0, retry = false;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.includes("api.brevo.com")) { emailCalls++; return { ok: retry || emailCalls === 1, status: 503, text: async () => "simulated rejection" }; }
    return { ok: true, arrayBuffer: async () => jpeg };
  });
  const first = await sendReceiptsToAccountant({ before: new Date(), periodLabel: "prueba" });
  assert.equal(first.status, "partial"); assert.equal(first.sent, 60);
  assert.equal(history[0].status, "partial"); assert.equal(history[0].recipients[0], "test@example.test");
  assert.equal(rows.filter((r) => r.sentToAccountantAt).length, 60); assert.ok(rows.every((r) => r.processing === null));
  retry = true;
  const second = await sendReceiptsToAccountant({ before: new Date(), periodLabel: "reintento" });
  assert.equal(second.sent, 1); assert.equal(second.status, "sent"); assert.equal(history[1].sent, 1);
});

test("HTTP real: paquete mayor a 100 KB cruza los parsers y los permisos siguen protegidos", async (t) => {
  fakeEnvironment(t);
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "receipt-test-secret";
  t.after(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
  let role = "manager";
  t.mock.method(StaffUser, "findOne", () => chain({ _id: id, name: "QA", role, locationId: "main", active: true }));
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, options);
    assert.match(String(url), /api\.cloudinary\.com/);
    return { ok: true, json: async () => ({ secure_url: "https://example.test/file.jpg", public_id: "file" }) };
  });
  t.mock.method(Receipt, "create", async (value) => ({ ...value, _id: id }));
  const app = express(); app.use(express.json()); app.use(sanitizeMongo); app.use("/api/staff/receipts", staffReceipts);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/staff/receipts`;
  const token = jwt.sign({ id, type: "staff" }, process.env.JWT_SECRET);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": RECEIPT_BUNDLE_TYPE };
  const large = Buffer.concat([jpeg, Buffer.alloc(150 * 1024)]);
  const body = JSON.stringify({ files: [{ name: "large.jpg", content: large.toString("base64") }] });
  const upload = await fetch(base, { method: "POST", headers, body });
  assert.equal(upload.status, 201); assert.equal((await upload.json()).receipt.documents.length, 1);
  const forbiddenSend = await fetch(`${base}/send-now`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(forbiddenSend.status, 403);
  role = "cashier";
  assert.equal((await fetch(base, { headers })).status, 403);
  assert.equal((await fetch(base, { method: "POST", headers, body })).status, 403);
});
