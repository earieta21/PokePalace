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
import monitorRoutes from "./routes/monitor.js";
import staffAdminRoutes from "./routes/staffAdmin.js";
import whatsappRoutes from "./routes/whatsapp.js";
import { logServerError } from "./controllers/monitorController.js";
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
// El webhook de WhatsApp necesita el body crudo para verificar la firma de
// Meta (X-Hub-Signature-256) — se captura aquí sin agregar un segundo parser.
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// Va antes de sanitizeMongo a propósito: el handshake de Meta manda query
// params con puntos literales (hub.mode, hub.verify_token, hub.challenge)
// que sanitizeMongo borraría; y el body del webhook nunca se usa para armar
// queries de Mongo con sus propias llaves, así que no necesita ese filtro.
// Su autenticidad ya la garantiza la verificación de firma, no el saneo genérico.
app.use("/api/whatsapp", whatsappRoutes);

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
app.use("/api/monitor",        monitorRoutes);
app.use("/api/staff/admin",    staffAdminRoutes);

app.get("/", (req, res) => {
  res.send("API Poke Palace funcionando 🍣");
});

// Errores no manejados en rutas Express → quedan registrados en el monitor.
app.use((err, req, res, next) => {
  logServerError(err, `${req.method} ${req.originalUrl}`);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: "Error interno del servidor" });
});

// Fallos a nivel proceso: se registran antes de que el proceso muera/continúe.
process.on("unhandledRejection", (reason) => {
  logServerError(reason instanceof Error ? reason : new Error(String(reason)), "unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logServerError(err, "uncaughtException");
  // Se le da un momento al registro y se termina: seguir con estado corrupto es peor.
  setTimeout(() => process.exit(1), 1500);
});

const PORT = process.env.PORT || 5001;

// El plan gratis de Render apaga el servidor tras ~15 min sin tráfico y el
// siguiente cliente espera 30-60 s a que despierte. Este auto-ping lo mantiene
// activo. Solo corre en Render (la variable RENDER la pone la plataforma);
// un servicio despierto 24/7 usa ~720 de las 750 h gratis del mes.
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || "https://pokepalace.onrender.com/";
function startKeepAlive() {
  if (!process.env.RENDER) return;
  setInterval(() => {
    fetch(KEEP_ALIVE_URL).catch(() => {});
  }, 10 * 60 * 1000);
  console.log("⏰ Keep-alive activo cada 10 min");
}

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB conectado");

    app.listen(PORT, () => {
      console.log(`✅ Server running on ${PORT}`);
      startKeepAlive();
    });
  } catch (err) {
    console.error("❌ Error conectando a MongoDB:", err.message);
    process.exit(1);
  }
};

start();

