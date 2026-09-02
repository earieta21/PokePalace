export const EMPLOYEE_DAILY_PROTEIN_GRAMS = 50;

export function normalizeInventoryCategory(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es-MX");
}

export function isProteinInventoryItem(item) {
  return ["protein", "proteins", "proteina", "proteinas"]
    .includes(normalizeInventoryCategory(item?.category));
}

export function gramsToInventoryQuantity(grams, unit) {
  const amount = Number(grams);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cleanUnit = String(unit || "").trim().toLocaleLowerCase("es-MX");
  if (cleanUnit === "kg") return Number((amount / 1000).toFixed(6));
  if (cleanUnit === "g" || cleanUnit === "gr") return Number(amount.toFixed(6));
  return null;
}
