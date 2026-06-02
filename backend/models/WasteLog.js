import mongoose from "mongoose";

const wasteSchema = new mongoose.Schema(
  {
    item:   { type: String, required: true },
    qty:    { type: Number, required: true, min: 0 },
    unit:   { type: String, default: "kg" },
    reason: { type: String, default: "Other" },
    cost:   { type: Number, default: 0 },
    staff:  { type: String, default: "" }, // staff name for display
    staffId:{ type: mongoose.Schema.Types.ObjectId, ref: "StaffUser" },
  },
  { timestamps: true }
);

export default mongoose.model("WasteLog", wasteSchema);
