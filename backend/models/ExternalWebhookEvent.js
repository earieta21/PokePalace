import mongoose from "mongoose";

const externalWebhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["uber_eats"], required: true },
    eventId: { type: String, required: true, trim: true, maxlength: 128 },
    eventType: { type: String, required: true, trim: true, maxlength: 100 },
    resourceId: { type: String, default: null, trim: true, maxlength: 128 },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["pending", "processing", "processed", "failed"],
      default: "pending",
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
    lastError: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true }
);

externalWebhookEventSchema.index(
  { provider: 1, eventId: 1 },
  { unique: true, name: "unique_external_webhook_event" }
);
externalWebhookEventSchema.index({ provider: 1, status: 1, nextAttemptAt: 1 });

export default mongoose.model("ExternalWebhookEvent", externalWebhookEventSchema);
