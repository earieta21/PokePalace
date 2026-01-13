import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import orderRoutes from "./routes/orders.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);

app.get("/", (req, res) => {
  res.send("API Poke Palace funcionando 🍣");
});

const PORT = process.env.PORT || 5001;

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB conectado");

    app.listen(PORT, () => {
      console.log(`✅ Server running on ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Error conectando a MongoDB:", err.message);
    process.exit(1);
  }
};

start();

