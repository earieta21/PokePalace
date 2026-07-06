import mongoose from "mongoose";

// One doc per locationId. schedule = { employeeId: { "0": "10-18", "1": "Libre", ... } }
const scheduleSchema = new mongoose.Schema(
  {
    locationId: { type: String, required: true, unique: true },
    schedule: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model("Schedule", scheduleSchema);
