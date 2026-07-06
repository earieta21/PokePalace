// Mirrors backend/pricing.js for display purposes only. The server always
// recomputes the authoritative price when the order is actually created.
export const BOWL_BASE_PRICE = 249;
export const LARGE_BOWL_UPCHARGE = 40;
export const TAX_RATE = 0; // IVA incluido en precio

const round2 = (n) => Math.round(n * 100) / 100;

export const computeBowlSubtotal = (bowlSize) =>
  BOWL_BASE_PRICE + (bowlSize === "large" ? LARGE_BOWL_UPCHARGE : 0);

export const computeDiscount = (subtotal, promo) => {
  if (!promo) return 0;
  if (promo.discountType === "fixed") return Math.min(promo.discountValue, subtotal);
  if (promo.discountType === "percent") return subtotal * (promo.discountValue / 100);
  return 0;
};

export const computePricing = (bowlSize, promo) => {
  const subtotal = computeBowlSubtotal(bowlSize);
  const discount = round2(computeDiscount(subtotal, promo));
  const taxable = subtotal - discount;
  const tax = round2(taxable * TAX_RATE);
  const total = round2(taxable + tax);
  return { subtotal: round2(subtotal), discount, tax, total };
};
