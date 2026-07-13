import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import StaffUser from "../models/StaffUser.js";

dotenv.config();

const run = async () => {
  try {
    const { MONGO_URI, STAFF_ADMIN_NAME, STAFF_ADMIN_EMAIL, STAFF_ADMIN_PASSWORD } = process.env;
    if (!MONGO_URI || !STAFF_ADMIN_NAME || !STAFF_ADMIN_EMAIL || !STAFF_ADMIN_PASSWORD) {
      throw new Error(
        "MONGO_URI, STAFF_ADMIN_NAME, STAFF_ADMIN_EMAIL and STAFF_ADMIN_PASSWORD are required"
      );
    }
    if (STAFF_ADMIN_PASSWORD.length < 12) {
      throw new Error("STAFF_ADMIN_PASSWORD must contain at least 12 characters");
    }

    await mongoose.connect(MONGO_URI);
    const existing = await StaffUser.findOne({ email: STAFF_ADMIN_EMAIL });
    if (existing) throw new Error("An account with STAFF_ADMIN_EMAIL already exists");

    await StaffUser.create({
      name: STAFF_ADMIN_NAME,
      email: STAFF_ADMIN_EMAIL,
      password: await bcrypt.hash(STAFF_ADMIN_PASSWORD, 12),
      role: "admin",
    });
    console.log("Staff admin created");
  } catch (err) {
    console.error("Error seeding staff admin:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
