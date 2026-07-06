import mongoose from "mongoose";

const timeRecordSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", required: true },
    clockIn: { type: Date, required: true },
    clockOut: { type: Date, default: null },
    date: { type: String, required: true },
    locationId: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("TimeRecord", timeRecordSchema);
