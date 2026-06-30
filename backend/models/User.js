import mongoose from "mongoose";

const favoriteBowlSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    base:        { type: String, default: null },
    proteins:    { type: [String], default: [] },
    bowlSize:    { type: String, enum: ["normal", "large"], default: "normal" },
    marinades:   { type: [String], default: [] },
    complements: { type: [String], default: [] },
    sauces:      { type: [String], default: [] },
    toppings:    { type: [String], default: [] },
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    points: { type: Number, default: 0 },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    favoriteBowls: { type: [favoriteBowlSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
