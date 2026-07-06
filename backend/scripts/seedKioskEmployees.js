import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import StaffUser from "../models/StaffUser.js";

dotenv.config();

const LOCATION_ID = "tij-centro-01";

const employees = [
  { name: "Eric",          email: "eric@pokepalace.com",    password: "emp123", role: "owner",   pin: "1234", color: "emerald" },
  { name: "Sofía Reyes",   email: "sofia@pokepalace.com",   password: "emp123", role: "manager", pin: "2222", color: "amber"   },
  { name: "Diego Luna",    email: "diego@pokepalace.com",   password: "emp123", role: "employee", pin: "3333", color: "sky"    },
  { name: "Valeria Cruz",  email: "valeria@pokepalace.com", password: "emp123", role: "employee", pin: "4444", color: "rose"   },
];

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB conectado");

    for (const emp of employees) {
      const exists = await StaffUser.findOne({ email: emp.email });
      if (exists) {
        await StaffUser.updateOne({ email: emp.email }, {
          pin: emp.pin, color: emp.color, locationId: LOCATION_ID, active: true,
        });
        console.log(`⟳  Actualizado: ${emp.name}`);
        continue;
      }
      const hashed = await bcrypt.hash(emp.password, 10);
      await StaffUser.create({ ...emp, password: hashed, locationId: LOCATION_ID });
      console.log(`✅ Creado: ${emp.name} · PIN ${emp.pin}`);
    }

    console.log("\n📋 PINs del kiosko:");
    employees.forEach((e) => console.log(`   ${e.name.padEnd(16)} → ${e.pin}`));
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
};

run();
