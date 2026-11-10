import mongoose from "mongoose";
import { CALENDAR_TYPES } from "../utils/teamCalendar.js";

const calendarEntrySchema = new mongoose.Schema({
  locationId: { type: String, required: true },
  clientRequestId: { type: String, required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: "", maxlength: 2000 },
  type: { type: String, enum: CALENDAR_TYPES, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  startTime: { type: String, default: "" },
  endTime: { type: String, default: "" },
  assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", required: true },
  assigneeName: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", required: true },
  createdByName: { type: String, required: true },
  priority: { type: String, enum: ["normal", "high"], default: "normal" },
  status: { type: String, enum: ["pending", "done"], default: "pending" },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

calendarEntrySchema.index({ locationId: 1, startDate: 1, endDate: 1 });
calendarEntrySchema.index({ locationId: 1, status: 1, endDate: 1 });
calendarEntrySchema.index({ locationId: 1, clientRequestId: 1 }, { unique: true });

export default mongoose.model("CalendarEntry", calendarEntrySchema);
