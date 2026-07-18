import mongoose from "mongoose";

const schema = new mongoose.Schema({
  key:              { type: String, default: "main" },
  unavailableItems: { type: [String], default: [] },
  ordersPaused:     { type: Boolean, default: false },
  pausedMessage:    { type: String, default: "" },
  lastBackupAt:     { type: Date, default: null },
});
schema.index({ key: 1 }, { unique: true });

export default mongoose.model("StoreSettings", schema);
