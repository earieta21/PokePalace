import mongoose from "mongoose";

const staffUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["admin", "cashier", "kitchen", "owner", "manager", "employee"],
      required: true,
    },
    pin: {
      type: String,
      default: null,
      select: false,
      validate: {
        validator: (value) => value === null || /^\$2[aby]\$\d{2}\$.{53}$/.test(value),
        message: "PIN must be stored as a bcrypt hash",
      },
    },
    color:      { type: String, default: "emerald" },
    locationId: { type: String, default: null },
    active:     { type: Boolean, default: true },
    hourlyRate: { type: Number, default: 0 }, // MXN por hora
  },
  { timestamps: true }
);

export default mongoose.model("StaffUser", staffUserSchema);
