import mongoose from "mongoose";

const schema = new mongoose.Schema({
  key:              { type: String, default: "main" },
  unavailableItems: { type: [String], default: [] },
});
schema.index({ key: 1 }, { unique: true });

export default mongoose.model("StoreSettings", schema);
