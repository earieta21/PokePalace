import PromoCode from "../models/PromoCode.js";

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

    const promo = await PromoCode.create({
      code: code.trim().toUpperCase(),
      discountType,
      discountValue,
      description: description || "",
      expiresAt: expiresAt || null,
      maxUses: maxUses || null,
    });

    res.status(201).json({ promo });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ msg: "Ese código ya existe" });
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
    const promo = await PromoCode.findById(req.params.id);
    if (!promo) return res.status(404).json({ msg: "Código no encontrado" });
    promo.isActive = !promo.isActive;
    await promo.save();
    res.json({ promo });
  } catch {
    res.status(500).json({ msg: "Error actualizando código" });
  }
};
