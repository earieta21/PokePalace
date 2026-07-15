import PromoCode from "../models/PromoCode.js";
import { BOWL_BASE_PRICE, LARGE_BOWL_UPCHARGE } from "../pricing.js";

const MAX_FIXED_DISCOUNT = BOWL_BASE_PRICE + LARGE_BOWL_UPCHARGE;

export const validatePromoCode = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code?.trim()) return res.status(400).json({ msg: "Ingresa un código" });

    const promo = await PromoCode.findOne({ code: code.trim().toUpperCase(), isActive: true });
    if (!promo) return res.status(404).json({ msg: "Código inválido o expirado" });

    if (promo.expiresAt && new Date() > promo.expiresAt) {
      return res.status(400).json({ msg: "Este código ya expiró" });
    }

    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      return res.status(400).json({ msg: "Este código ya llegó a su límite de usos" });
    }

    res.json({
      valid: true,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      description: promo.description,
    });
  } catch {
    res.status(500).json({ msg: "Error validando código" });
  }
};

// Staff-only: create promo codes
export const createPromoCode = async (req, res) => {
  try {
    const { code, discountType, discountValue, description, expiresAt, maxUses } = req.body;
    if (!code || !discountType || discountValue === undefined) {
      return res.status(400).json({ msg: "Faltan campos requeridos" });
    }

    const cleanCode = typeof code === "string" ? code.trim().toUpperCase() : "";
    const numericDiscount = Number(discountValue);
    const numericMaxUses = maxUses === undefined || maxUses === null || maxUses === ""
      ? null
      : Number(maxUses);
    const parsedExpiry = expiresAt ? new Date(expiresAt) : null;

    if (!cleanCode || cleanCode.length > 40) {
      return res.status(400).json({ msg: "Código promocional inválido" });
    }
    if (!["percent", "fixed"].includes(discountType) || !Number.isFinite(numericDiscount)) {
      return res.status(400).json({ msg: "Tipo o valor de descuento inválido" });
    }
    const maxDiscount = discountType === "percent" ? 100 : MAX_FIXED_DISCOUNT;
    if (numericDiscount < 0 || numericDiscount > maxDiscount) {
      return res.status(400).json({
        msg: discountType === "percent"
          ? "El porcentaje debe estar entre 0 y 100"
          : `El descuento fijo no puede superar $${MAX_FIXED_DISCOUNT} MXN`,
      });
    }
    if (numericMaxUses !== null && (!Number.isInteger(numericMaxUses) || numericMaxUses < 1)) {
      return res.status(400).json({ msg: "El límite de usos debe ser un entero positivo" });
    }
    if (parsedExpiry && Number.isNaN(parsedExpiry.getTime())) {
      return res.status(400).json({ msg: "Fecha de expiración inválida" });
    }

    const promo = await PromoCode.create({
      code: cleanCode,
      discountType,
      discountValue: numericDiscount,
      description: description || "",
      expiresAt: parsedExpiry,
      maxUses: numericMaxUses,
    });

    res.status(201).json({ promo });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: "Ese código ya existe" });
    if (err.name === "ValidationError") return res.status(400).json({ msg: err.message });
    res.status(500).json({ msg: "Error creando código" });
  }
};

export const listPromoCodes = async (req, res) => {
  try {
    const promos = await PromoCode.find().sort({ createdAt: -1 });
    res.json({ promos });
  } catch {
    res.status(500).json({ msg: "Error obteniendo códigos" });
  }
};

export const togglePromoCode = async (req, res) => {
  try {
    const current = await PromoCode.findById(req.params.id).select("isActive").lean();
    if (!current) return res.status(404).json({ msg: "Código no encontrado" });

    // Update only the operational flag. This also lets staff deactivate a
    // legacy promotion whose old value is now outside today's stricter limits
    // without revalidating and saving the entire historical document.
    const promo = await PromoCode.findByIdAndUpdate(
      current._id,
      { $set: { isActive: !current.isActive } },
      { new: true }
    );
    res.json({ promo });
  } catch (error) {
    if (error?.name === "CastError") return res.status(404).json({ msg: "Código no encontrado" });
    res.status(500).json({ msg: "Error actualizando código" });
  }
};
