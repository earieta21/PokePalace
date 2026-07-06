import mongoose from "mongoose";

const staffUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "cashier", "kitchen", "owner", "manager", "employee"],
      required: true,
    },
    pin:        { type: String, length: 4, default: null },
    color:      { type: String, default: "emerald" },
    locationId: { type: String, default: null },
    active:     { type: Boolean, default: true },
    hourlyRate: { type: Number, default: 0 }, // MXN por hora
  },
  { timestamps: true }
);

export default mongoose.model("StaffUser", staffUserSchema);
