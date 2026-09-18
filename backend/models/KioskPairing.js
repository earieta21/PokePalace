import mongoose from "mongoose";

// Sesión efímera para que un cliente se identifique en el kiosco escaneando
// un QR con su celular, en vez de teclear nombre/teléfono. El documento se
// autodestruye a los 5 minutos (TTL) — nunca se reutiliza ni se guarda nada
// sensible aquí: solo un vínculo temporal token -> userId.
const kioskPairingSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // token aleatorio, va en la URL del QR
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  confirmedAt: { type: Date, default: null },
  consumedAt: { type: Date, default: null }, // el kiosco ya lo leyó una vez
  createdAt: { type: Date, default: Date.now, expires: 300 },
});

export default mongoose.models.KioskPairing || mongoose.model("KioskPairing", kioskPairingSchema);
