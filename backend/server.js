import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes        from "./routes/auth.js";
import orderRoutes       from "./routes/orders.js";
import userRoutes        from "./routes/users.js";
import promoCodeRoutes   from "./routes/promoCodes.js";
import staffAuthRoutes   from "./routes/staffAuth.js";
import staffOrderRoutes  from "./routes/staffOrders.js";
import staffInvRoutes    from "./routes/staffInventory.js";
import staffWasteRoutes  from "./routes/staffWaste.js";
import staffEmpRoutes    from "./routes/staffEmployees.js";
import kioskRoutes       from "./routes/kiosk.js";
import expenseRoutes     from "./routes/expenses.js";
import settingsRoutes    from "./routes/settings.js";
import rewardsRoutes     from "./routes/rewards.js";
import staffRewardsRoutes from "./routes/staffRewards.js";
import staffBackupRoutes from "./routes/staffBackup.js";
import staffSummaryRoutes from "./routes/staffSummary.js";
import { sanitizeMongo } from "./middleware/sanitizeMongo.js";

dotenv.config();

const app = express();

// Render sits behind a reverse proxy — trust its X-Forwarded-For header so
// req.ip reflects the real client IP (needed for accurate rate limiting).
app.set("trust proxy", 1);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow any localhost port (dev) + production domains, including a
      // dedicated POS subdomain (e.g. pos.pokepalace.org or pos-pokepalace.netlify.app).
      // The netlify.app domains stay allowed as a fallback (deploy previews, and
      // Netlify keeps that subdomain live alongside the custom domain).
      const allowed = [
        /^http:\/\/localhost:\d+$/,
        /^https:\/\/(www\.)?pokepalace\.org$/,
        /^https:\/\/pos\.pokepalace\.org$/,
        /^https:\/\/(pos[.-])?pokepalace\.netlify\.app$/,
        /^https:\/\/pokepalace\.onrender\.com$/,
        /^https:\/\/pos\.pokepalace\.com$/,
      ];
      if (!origin || allowed.some((r) => r.test(origin))) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(sanitizeMongo);

app.use("/api/auth",            authRoutes);
app.use("/api/users",          userRoutes);
app.use("/api/promo-codes",    promoCodeRoutes);
app.use("/api/staff-auth",     staffAuthRoutes);
app.use("/api/orders",         orderRoutes);
app.use("/api/staff/orders",   staffOrderRoutes);
app.use("/api/staff/inventory",staffInvRoutes);
app.use("/api/staff/waste",    staffWasteRoutes);
app.use("/api/staff/employees",staffEmpRoutes);
app.use("/api/kiosk",          kioskRoutes);
app.use("/api/staff/expenses", expenseRoutes);
app.use("/api/settings",       settingsRoutes);
app.use("/api/rewards",        rewardsRoutes);
app.use("/api/staff/rewards",  staffRewardsRoutes);
app.use("/api/staff/backup",   staffBackupRoutes);
app.use("/api/staff/summary",  staffSummaryRoutes);

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

