import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import StaffUser from "../models/StaffUser.js";

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");

    const existing = await StaffUser.findOne({
      email: "admin@pokepalace.com",
    });

    if (existing) {
      console.log("⚠️ Admin already exists");
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash("admin123", 10);

    await StaffUser.create({
      name: "Admin",
      email: "admin@pokepalace.com",
      password: hashedPassword,
      role: "admin",
    });

    console.log("✅ Staff admin created");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding staff:", err);
    process.exit(1);
  }
};

run();
