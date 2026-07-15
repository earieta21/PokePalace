import User from "../models/User.js";
import StaffUser from "../models/StaffUser.js";
import Order from "../models/Order.js";
import Inventory from "../models/Inventory.js";
import Expense from "../models/Expense.js";
import TimeRecord from "../models/TimeRecord.js";
import TempRecord from "../models/TempRecord.js";
import ChecklistRecord from "../models/ChecklistRecord.js";
import Schedule from "../models/Schedule.js";
import WasteLog from "../models/WasteLog.js";
import PromoCode from "../models/PromoCode.js";
import Redemption from "../models/Redemption.js";
import Announcement from "../models/Announcement.js";
import StoreSettings from "../models/StoreSettings.js";
import SocialStoryParticipant from "../models/SocialStoryParticipant.js";

/* GET /api/staff/backup/status */
export const getBackupStatus = async (req, res) => {
  try {
    const settings = await StoreSettings.findOne({ key: "main" });
    res.json({ lastBackupAt: settings?.lastBackupAt || null });
  } catch (err) {
    res.status(500).json({ message: "Error al consultar el respaldo", err: err.message });
  }
};

/* GET /api/staff/backup — exporta la base completa en un solo JSON.
   Incluye los hashes de contraseñas/PINs (nunca las claves en claro) para
   que una restauración deje el sistema funcionando sin re-configurar accesos.
   El archivo descargado debe guardarse en un lugar seguro. */
export const exportBackup = async (req, res) => {
  try {
    const [
      users, staffUsers, orders, inventory, expenses,
      timeRecords, tempRecords, checklistRecords, schedules,
      wasteLogs, promoCodes, redemptions, announcements,
      storeSettings, socialStoryParticipants,
    ] = await Promise.all([
      User.find().select("+password").lean(),
      StaffUser.find().select("+password +pin").lean(),
      Order.find().lean(),
      Inventory.find().lean(),
      Expense.find().lean(),
      TimeRecord.find().lean(),
      TempRecord.find().lean(),
      ChecklistRecord.find().lean(),
      Schedule.find().lean(),
      WasteLog.find().lean(),
      PromoCode.find().lean(),
      Redemption.find().lean(),
      Announcement.find().lean(),
      StoreSettings.find().lean(),
      SocialStoryParticipant.find().lean(),
    ]);

    const collections = {
      users, staffUsers, orders, inventory, expenses,
      timeRecords, tempRecords, checklistRecords, schedules,
      wasteLogs, promoCodes, redemptions, announcements,
      storeSettings, socialStoryParticipants,
    };

    const counts = Object.fromEntries(
      Object.entries(collections).map(([name, docs]) => [name, docs.length])
    );

    const exportedAt = new Date();
    await StoreSettings.findOneAndUpdate(
      { key: "main" },
      { lastBackupAt: exportedAt },
      { upsert: true }
    );

    res.json({
      app: "PokePalace",
      version: 1,
      exportedAt,
      exportedBy: req.staff?.name || req.staff?.email || "staff",
      counts,
      collections,
    });
  } catch (err) {
    res.status(500).json({ message: "Error al generar el respaldo", err: err.message });
  }
};
