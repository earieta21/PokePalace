// Mirrors backend/pricing.js for display purposes only. The server always
// recomputes the authoritative price when the order is actually created.
export const BOWL_BASE_PRICE = 230;       // bowl mediano (2 proteínas, 100 g)
export const LARGE_BOWL_UPCHARGE = 20;    // bowl grande (3 proteínas, 120 g) = 230 + 20 = 250
export const EXTRA_SCOOP_PRICE = 40;      // porción extra (40 g) de una proteína ya elegida
export const COMPLEMENT_FREE_LIMIT = 6;   // complementos incluidos sin costo
export const EXTRA_COMPLEMENT_PRICE = 15; // cada complemento más allá del límite gratis
export const TAX_RATE = 0; // IVA incluido en precio

const round2 = (n) => Math.round(n * 100) / 100;

export const computeBowlSubtotal = (bowlSize) =>
  BOWL_BASE_PRICE + (bowlSize === "large" ? LARGE_BOWL_UPCHARGE : 0);

export const computeExtrasSubtotal = ({ extraScoops = 0, complementsCount = 0 } = {}) => {
  const scoopsCost = Math.max(0, Number(extraScoops) || 0) * EXTRA_SCOOP_PRICE;
  const extraComplements = Math.max(0, (Number(complementsCount) || 0) - COMPLEMENT_FREE_LIMIT);
  return scoopsCost + extraComplements * EXTRA_COMPLEMENT_PRICE;
};

export const computeDiscount = (subtotal, promo) => {
  if (!promo) return 0;
  const value = Number(promo.discountValue);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (promo.discountType === "fixed") return Math.min(value, subtotal);
  if (promo.discountType === "percent") {
    const safePercent = Math.min(value, 100);
    return subtotal * (safePercent / 100);
  }
  return 0;
};

export const computePricing = (bowlSize, promo, extras = {}) => {
  const subtotal = computeBowlSubtotal(bowlSize) + computeExtrasSubtotal(extras);
  const discount = round2(computeDiscount(subtotal, promo));
  const taxable = Math.max(0, subtotal - discount);
  const tax = round2(taxable * TAX_RATE);
  const total = round2(taxable + tax);
  return { subtotal: round2(subtotal), discount, tax, total };
};
