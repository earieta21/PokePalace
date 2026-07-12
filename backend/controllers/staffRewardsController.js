import Redemption from "../models/Redemption.js";

export const lookupRedemption = async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    const redemption = await Redemption.findOne({ code }).populate("user", "name email");
    if (!redemption) return res.status(404).json({ msg: "Código no encontrado" });
    res.json({ redemption });
  } catch {
    res.status(500).json({ msg: "Error buscando el código" });
  }
};

export const useRedemption = async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();

    // Atomic: only succeeds if it's still "active", so the same code can't
    // be marked used twice by two staff members scanning it at once.
    const redemption = await Redemption.findOneAndUpdate(
      { code, status: "active" },
      { status: "used", usedAt: new Date(), usedBy: req.staff.id },
      { new: true }
    ).populate("user", "name email");

    if (!redemption) {
      const existing = await Redemption.findOne({ code });
      if (!existing) return res.status(404).json({ msg: "Código no encontrado" });
      return res.status(400).json({ msg: `Este código ya fue usado el ${existing.usedAt?.toLocaleString("es-MX") || ""}` });
    }

    res.json({ redemption });
  } catch {
    res.status(500).json({ msg: "Error canjeando el código" });
  }
};
