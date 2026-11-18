import mongoose from "mongoose";

// One row per member and restaurant month. Reloads and repeat previews keep
// the first timestamps, so a member can contribute at most once per stage.
const schema = new mongoose.Schema({
  month: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  firstVisitAt: { type: Date, required: true },
  firstSelectionAt: Date,
});
schema.index({ month: 1, user: 1 }, { unique: true });

export default mongoose.model("RewardVisit", schema);
