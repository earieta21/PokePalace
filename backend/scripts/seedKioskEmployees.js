import crypto from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import StaffUser from "../models/StaffUser.js";
import { hashPin, isValidPin } from "../utils/staffPin.js";

dotenv.config();

const locationId = process.env.KIOSK_LOCATION_ID;

const readEmployees = () => {
  if (!process.env.KIOSK_EMPLOYEES_JSON) {
    throw new Error("KIOSK_EMPLOYEES_JSON is required");
  }
  const employees = JSON.parse(process.env.KIOSK_EMPLOYEES_JSON);
  if (!Array.isArray(employees) || employees.length === 0) {
    throw new Error("KIOSK_EMPLOYEES_JSON must be a non-empty JSON array");
  }
  return employees;
};

const run = async () => {
  try {
    if (!process.env.MONGO_URI || !locationId) {
      throw new Error("MONGO_URI and KIOSK_LOCATION_ID are required");
    }
    const employees = readEmployees();
    await mongoose.connect(process.env.MONGO_URI);

    for (const employee of employees) {
      const { name, email, role = "employee", pin, color = "emerald" } = employee;
      if (!name || !email || !isValidPin(pin)) {
        throw new Error("Each employee requires name, email and a 4-digit PIN");
      }

      const pinHash = await hashPin(pin);
      const existing = await StaffUser.findOne({ email });
      if (existing) {
        await StaffUser.updateOne(
          { _id: existing._id },
          { pin: pinHash, color, role, locationId, active: true },
          { runValidators: true }
        );
      } else {
        const generatedPassword = crypto.randomBytes(32).toString("base64url");
        await StaffUser.create({
          name,
          email,
          password: await bcrypt.hash(generatedPassword, 12),
          role,
          pin: pinHash,
          color,
          locationId,
          active: true,
        });
      }
      console.log(`Seeded employee: ${name}`);
    }
  } catch (err) {
    console.error("Error seeding kiosk employees:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
