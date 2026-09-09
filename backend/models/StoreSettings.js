import mongoose from "mongoose";

const schema = new mongoose.Schema({
  key:              { type: String, default: "main" },
  unavailableItems: { type: [String], default: [] },
  ordersPaused:     { type: Boolean, default: false },
  pausedMessage:    { type: String, default: "" },
  lastBackupAt:     { type: Date, default: null },
  // "YYYY-MM-17" del último recordatorio fiscal ya enviado -- evita mandarlo
  // dos veces para la misma fecha límite (ver utils/fiscalReminder.js).
  lastFiscalReminderSentFor: { type: String, default: null },
});
schema.index({ key: 1 }, { unique: true });

export default mongoose.model("StoreSettings", schema);
