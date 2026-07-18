// Single source of truth for bowl pricing. Mirrored in src/order/pricing.js
// for client-side display — the server always recomputes from scratch and
// never trusts a price submitted by the client.
export const BOWL_BASE_PRICE = 249;
export const LARGE_BOWL_UPCHARGE = 40;
export const TAX_RATE = 0; // IVA incluido en precio

const round2 = (n) => Math.round(n * 100) / 100;

export const computeBowlSubtotal = (bowlSize) =>
  BOWL_BASE_PRICE + (bowlSize === "large" ? LARGE_BOWL_UPCHARGE : 0);

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

export const computePricing = (bowlSize, promo) => {
  const subtotal = computeBowlSubtotal(bowlSize);
  const discount = round2(computeDiscount(subtotal, promo));
  const taxable = Math.max(0, subtotal - discount);
  const tax = round2(taxable * TAX_RATE);
  const total = round2(taxable + tax);
  return { subtotal: round2(subtotal), discount, tax, total };
};
