import mongoose from "mongoose";
import dotenv from "dotenv";
import StaffUser from "../models/StaffUser.js";
import { hashPin, isHashedPin, isValidPin } from "../utils/staffPin.js";

dotenv.config();

const run = async () => {
  try {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
    await mongoose.connect(process.env.MONGO_URI);

    const users = await StaffUser.find({ pin: { $ne: null } }).select("+pin");
    let migrated = 0;
    for (const user of users) {
      if (isHashedPin(user.pin)) continue;
      if (!isValidPin(user.pin)) {
        throw new Error(`Invalid legacy PIN for staff user ${user._id}`);
      }
      user.pin = await hashPin(user.pin);
      await user.save();
      migrated += 1;
    }
    console.log(`Migrated ${migrated} staff PIN(s)`);
  } catch (err) {
    console.error("Error migrating staff PINs:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
