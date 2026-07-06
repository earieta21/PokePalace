import mongoose from "mongoose";

// One doc per date+locationId+listId. items = { "0": {by, ts}, "3": {by, ts}, ... }
const checklistRecordSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    locationId: { type: String, required: true },
    listId: { type: String, required: true },
    items: { type: Map, of: { by: mongoose.Schema.Types.ObjectId, ts: Date }, default: {} },
  },
  { timestamps: true }
);

checklistRecordSchema.index({ date: 1, locationId: 1, listId: 1 }, { unique: true });

export default mongoose.model("ChecklistRecord", checklistRecordSchema);
