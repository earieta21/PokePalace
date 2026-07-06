import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "StaffUser", required: true },
    locationId: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("Announcement", announcementSchema);
