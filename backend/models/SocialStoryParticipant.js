import mongoose from "mongoose";

const socialStoryParticipantSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ["instagram", "facebook"],
      required: true,
    },
    handleNormalized: { type: String, required: true },
    displayHandle: { type: String, required: true },
    lastClaimAt: { type: Date, required: true },
    nextEligibleAt: { type: Date, required: true },
    lastVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StaffUser",
      required: true,
    },
  },
  { timestamps: true }
);

socialStoryParticipantSchema.index(
  { platform: 1, handleNormalized: 1 },
  { unique: true }
);

export default mongoose.model("SocialStoryParticipant", socialStoryParticipantSchema);
