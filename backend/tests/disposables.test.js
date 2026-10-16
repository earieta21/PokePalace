import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DisposableValidationError,
  disposableStatus,
  normalizeRequestId,
  sanitizeDisposableFields,
  splitPieces,
  toPieces,
} from "../utils/disposables.js";

test("paquetes y piezas sueltas se convierten a piezas y de regreso", () => {
  assert.equal(toPieces({ packs: 3, pieces: 12 }, 50), 162);
  assert.equal(toPieces({ packs: "2", pieces: "" }, 50), 100);
  assert.deepEqual(splitPieces(162, 50), { packs: 3, pieces: 12, total: 162 });
  assert.deepEqual(splitPieces(0, 50), { packs: 0, pieces: 0, total: 0 });
});

test("las cantidades deben ser enteras y no negativas", () => {
  assert.throws(() => toPieces({ packs: 1.5 }, 50), DisposableValidationError);
  assert.throws(() => toPieces({ pieces: -1 }, 50), DisposableValidationError);
  assert.throws(() => toPieces({ packs: 1 }, 0), DisposableValidationError);
});

test("el estado compara contra el mínimo en paquetes", () => {
  assert.equal(disposableStatus({ pieces: 0, piecesPerPack: 50, minPacks: 2 }), "out");
  assert.equal(disposableStatus({ pieces: 100, piecesPerPack: 50, minPacks: 2 }), "low");
  assert.equal(disposableStatus({ pieces: 101, piecesPerPack: 50, minPacks: 2 }), "ok");
  assert.equal(disposableStatus({ pieces: 5, piecesPerPack: 50, minPacks: 0 }), "ok");
});

test("los datos del desechable no aceptan precio ni existencia", () => {
  const clean = sanitizeDisposableFields({
    name: "  Bowl 32 oz ", category: "Contenedores", piecesPerPack: "50", minPacks: "2",
    cost: 300, pieces: 999,
  });
  assert.deepEqual(clean, { name: "Bowl 32 oz", category: "Contenedores", piecesPerPack: 50, minPacks: 2 });
  assert.deepEqual(sanitizeDisposableFields({ minPacks: 1 }, { partial: true }), { minPacks: 1 });
  assert.throws(() => sanitizeDisposableFields({ name: "", piecesPerPack: 50 }), DisposableValidationError);
  assert.throws(() => sanitizeDisposableFields({ name: "Vaso", category: "Comida", piecesPerPack: 50 }), DisposableValidationError);
});

test("los folios de operación se validan", () => {
  assert.equal(normalizeRequestId("disp-1234567890abcdef"), "disp-1234567890abcdef");
  assert.throws(() => normalizeRequestId("corto"), DisposableValidationError);
});
