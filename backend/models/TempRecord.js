import mongoose from "mongoose";

const tempRecordSchema = new mongoose.Schema(
  {
    stationId: { type: String, required: true },
    value: { type: Number, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", required: true },
    date: { type: String, required: true },
    locationId: { type: String, required: true },
    ts: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export default mongoose.model("TempRecord", tempRecordSchema);
