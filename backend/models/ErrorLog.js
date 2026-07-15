import mongoose from "mongoose";

const errorLogSchema = new mongoose.Schema(
  {
    source:    { type: String, enum: ["frontend", "backend"], required: true },
    message:   { type: String, required: true, maxlength: 500 },
    stack:     { type: String, default: "", maxlength: 2000 },
    url:       { type: String, default: "", maxlength: 300 },
    userAgent: { type: String, default: "", maxlength: 300 },
    count:     { type: Number, default: 1 }, // repeticiones del mismo error
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Se borran solos a los 30 días — el monitoreo no debe llenar la base.
errorLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
errorLogSchema.index({ source: 1, message: 1, url: 1 });

export default mongoose.model("ErrorLog", errorLogSchema);
