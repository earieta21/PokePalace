import mongoose from "mongoose";

const redemptionSchema = new mongoose.Schema(
  {
    user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    clientRedemptionId: { type: String, trim: true, maxlength: 100, default: null },
    rewardId:    { type: Number, required: true },
    rewardName:  { type: String, required: true }, // snapshot at redemption time
    pointsCost:  { type: Number, required: true },
    code:        { type: String, required: true, unique: true },
    status:      { type: String, enum: ["active", "used", "cancelled", "expired"], default: "active" },
    expiresAt:   { type: Date, default: null },
    usedAt:      { type: Date, default: null },
    usedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", default: null },
    order:       { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    source: {
      type: String,
      enum: ["loyalty", "social_story"],
      default: "loyalty",
    },
    socialPlatform: {
      type: String,
      enum: ["instagram", "facebook", null],
      default: null,
    },
    socialHandle: { type: String, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

redemptionSchema.index({ order: 1 }, { unique: true, sparse: true });
redemptionSchema.index(
  { user: 1, clientRedemptionId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientRedemptionId: { $type: "string" } },
  }
);

export default mongoose.model("Redemption", redemptionSchema);
