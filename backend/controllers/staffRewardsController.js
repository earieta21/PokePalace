import Redemption from "../models/Redemption.js";

// Marca como "expired" (lazy) un redemption activo cuya fecha ya pasó.
// Devuelve el documento ya actualizado si aplicó el cambio.
async function markExpiredIfNeeded(redemption) {
  if (redemption && redemption.status === "active" && redemption.expiresAt && redemption.expiresAt < new Date()) {
    redemption.status = "expired";
    await redemption.save();
  }
  return redemption;
}

export const lookupRedemption = async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    let redemption = await Redemption.findOne({ code }).populate("user", "name email");
    if (!redemption) return res.status(404).json({ msg: "Código no encontrado" });
    redemption = await markExpiredIfNeeded(redemption);
    res.json({ redemption });
  } catch {
    res.status(500).json({ msg: "Error buscando el código" });
  }
};

export const useRedemption = async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();

    // Atomic: only succeeds if it's still "active" and not past its expiry,
    // so the same code can't be marked used twice by two staff members
    // scanning it at once, and an expired code can't slip through either.
    const redemption = await Redemption.findOneAndUpdate(
      {
        code,
        status: "active",
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      },
      { status: "used", usedAt: new Date(), usedBy: req.staff.id },
      { new: true }
    ).populate("user", "name email");

    if (!redemption) {
      let existing = await Redemption.findOne({ code });
      if (!existing) return res.status(404).json({ msg: "Código no encontrado" });

      existing = await markExpiredIfNeeded(existing);
      if (existing.status === "expired") {
        return res.status(400).json({ msg: "Este código ya venció" });
      }
      if (existing.status === "used") {
        return res.status(400).json({ msg: `Este código ya fue usado el ${existing.usedAt?.toLocaleString("es-MX") || ""}` });
      }
      return res.status(400).json({ msg: "Este código ya no está disponible" });
    }

    res.json({ redemption });
  } catch {
    res.status(500).json({ msg: "Error canjeando el código" });
  }
};
