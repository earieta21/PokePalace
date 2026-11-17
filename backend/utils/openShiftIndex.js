import TimeRecord from "../models/TimeRecord.js";

let pending;
// Production may disable autoIndex. Never accept a new shift until its
// concurrency constraint exists. Existing records are never edited here.
export function ensureOpenShiftIndex() {
  if (!pending) {
    pending = TimeRecord.collection.createIndex({ employeeId: 1 }, {
      name: "one_open_shift_per_employee", unique: true,
      partialFilterExpression: { clockOut: null },
    }).catch((error) => { pending = null; throw error; });
  }
  return pending;
}
