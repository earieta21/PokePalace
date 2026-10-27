import mongoose from "mongoose";

// Passkey (Face ID / huella / Windows Hello) que un empleado registró en uno
// de sus dispositivos. Solo se guarda la llave pública: la privada nunca sale
// del dispositivo.
const staffPasskeySchema = new mongoose.Schema(
  {
    staffId:      { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", required: true, index: true },
    credentialId: { type: String, required: true, unique: true }, // base64url
    publicKey:    { type: String, required: true },               // SPKI DER en base64url
    algorithm:    { type: Number, required: true },               // COSE: -7 ES256, -257 RS256
    signCount:    { type: Number, default: 0 },
    transports:   { type: [String], default: [] },
    rpId:         { type: String, required: true },
    deviceLabel:  { type: String, default: "" },
    lastUsedAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("StaffPasskey", staffPasskeySchema);
