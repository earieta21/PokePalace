import mongoose from "mongoose";

const redemptionSchema = new mongoose.Schema(
  {
    user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rewardId:    { type: Number, required: true },
    rewardName:  { type: String, required: true }, // snapshot at redemption time
    pointsCost:  { type: Number, required: true },
    code:        { type: String, required: true, unique: true },
    status:      { type: String, enum: ["active", "used", "cancelled", "expired"], default: "active" },
    expiresAt:   { type: Date, default: null },
    usedAt:      { type: Date, default: null },
    usedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Redemption", redemptionSchema);
