import mongoose from "mongoose";

const schema = new mongoose.Schema({
  recipients: { type: [String], default: [] },
  periodLabel: { type: String, required: true },
  status: { type: String, enum: ["sending", "sent", "partial", "failed", "uncertain"], default: "sending" },
  sent: { type: Number, default: 0 },
  emails: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  error: { type: String, default: "" },
  completedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ createdAt: -1 });
export default mongoose.model("ReceiptDelivery", schema);
