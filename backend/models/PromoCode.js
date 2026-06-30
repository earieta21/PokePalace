import mongoose from "mongoose";

const promoCodeSchema = new mongoose.Schema(
  {
    code:          { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountType:  { type: String, enum: ["percent", "fixed"], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    description:   { type: String, default: "" },
    expiresAt:     { type: Date, default: null },
    maxUses:       { type: Number, default: null },
    usedCount:     { type: Number, default: 0 },
    isActive:      { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("PromoCode", promoCodeSchema);
