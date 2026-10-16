// Desechables (bowls, tapas, vasos, bolsas…): se cuentan en piezas y se
// muestran como paquetes completos + piezas sueltas. A propósito no tienen
// precio — el costo de compra sigue viviendo en Inventario/Finanzas.
export const DISPOSABLE_CATEGORIES = [
  "Contenedores", "Tapas", "Vasos", "Bolsas", "Cubiertos", "Servilletas", "Otro",
];

const MAX_PIECES_PER_PACK = 100000;
const MAX_PIECES = 10000000;

export class DisposableValidationError extends Error {}

const wholeNumber = (value, label, { min = 0, max = MAX_PIECES } = {}) => {
  const n = Number(value === "" || value === null || value === undefined ? 0 : value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new DisposableValidationError(`${label} debe ser un número entero entre ${min} y ${max}`);
  }
  return n;
};

export const sanitizePiecesPerPack = (value) =>
  wholeNumber(value, "Las piezas por paquete", { min: 1, max: MAX_PIECES_PER_PACK });

// { packs, pieces } -> total de piezas. Las piezas sueltas pueden ser más
// que un paquete (p. ej. si alguien contó todo suelto); se suman tal cual.
export const toPieces = ({ packs = 0, pieces = 0 }, piecesPerPack) => {
  const ppp = sanitizePiecesPerPack(piecesPerPack);
  const total = wholeNumber(packs, "Los paquetes") * ppp + wholeNumber(pieces, "Las piezas");
  if (total > MAX_PIECES) throw new DisposableValidationError("La cantidad es demasiado grande");
  return total;
};

export const splitPieces = (pieces, piecesPerPack) => {
  const ppp = Math.max(1, Number(piecesPerPack) || 1);
  const total = Math.max(0, Math.floor(Number(pieces) || 0));
  return { packs: Math.floor(total / ppp), pieces: total % ppp, total };
};

export const disposableStatus = ({ pieces, piecesPerPack, minPacks }) => {
  const total = Math.max(0, Number(pieces) || 0);
  if (total === 0) return "out";
  const min = Math.max(0, Number(minPacks) || 0) * Math.max(1, Number(piecesPerPack) || 1);
  return total <= min ? "low" : "ok";
};

// Datos editables del artículo (nunca la existencia: esa solo cambia por
// recibir, contar o sacar, para que cada cambio quede en la bitácora).
export const sanitizeDisposableFields = (body = {}, { partial = false } = {}) => {
  const out = {};
  const has = (field) => Object.prototype.hasOwnProperty.call(body, field);

  if (!partial || has("name")) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!name) throw new DisposableValidationError("Escribe el nombre del desechable");
    out.name = name;
  }
  if (!partial || has("category")) {
    const category = body.category || "Otro";
    if (!DISPOSABLE_CATEGORIES.includes(category)) {
      throw new DisposableValidationError("Elige una categoría válida");
    }
    out.category = category;
  }
  if (!partial || has("piecesPerPack")) out.piecesPerPack = sanitizePiecesPerPack(body.piecesPerPack);
  if (!partial || has("minPacks")) {
    const minPacks = Number(body.minPacks === "" || body.minPacks == null ? 0 : body.minPacks);
    if (!Number.isFinite(minPacks) || minPacks < 0 || minPacks > 100000) {
      throw new DisposableValidationError("El mínimo de paquetes no es válido");
    }
    out.minPacks = Math.round(minPacks * 100) / 100;
  }
  return out;
};

export const normalizeRequestId = (value) => {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(id)) {
    throw new DisposableValidationError("Identificador de operación inválido");
  }
  return id;
};
