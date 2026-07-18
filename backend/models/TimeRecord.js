import mongoose from "mongoose";

const breakSchema = new mongoose.Schema(
  {
    start: { type: Date, required: true },
    end:   { type: Date, default: null },
  },
  { _id: false }
);

const timeRecordSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", required: true },
    clockIn: { type: Date, required: true },
    clockOut: { type: Date, default: null },
    breaks: { type: [breakSchema], default: [] }, // lonches — se descuentan de las horas pagadas
    date: { type: String, required: true },
    locationId: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("TimeRecord", timeRecordSchema);
