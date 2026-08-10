import mongoose from "mongoose";

const schema = new mongoose.Schema({
  key:              { type: String, default: "main" },
  unavailableItems: { type: [String], default: [] },
  ordersPaused:     { type: Boolean, default: false },
  pausedMessage:    { type: String, default: "" },
  lastBackupAt:     { type: Date, default: null },
  // Excepciones puntuales a la regla fija de "cerrado los miércoles"
  // (CLOSED_WEEKDAY en backend/utils/customerOrder.js) -- fechas "YYYY-MM-DD"
  // que abren un día normalmente cerrado, o cierran uno normalmente abierto,
  // sin tocar la regla general de ningún otro día.
  openDayOverrides:   { type: [String], default: [] },
  closedDayOverrides: { type: [String], default: [] },
});
schema.index({ key: 1 }, { unique: true });

export default mongoose.model("StoreSettings", schema);
