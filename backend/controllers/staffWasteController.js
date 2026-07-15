import WasteLog from "../models/WasteLog.js";
import { dayRangeInTimeZone } from "../utils/timeZone.js";

/* GET /api/staff/waste?limit=50 */
export const getWasteLogs = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const logs = await WasteLog.find()
      .sort({ createdAt: -1 })
      .limit(Number(limit));
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ message: "Error fetching waste logs", err: err.message });
  }
};

/* POST /api/staff/waste */
export const createWasteLog = async (req, res) => {
  try {
    const { item, qty, unit, reason, cost } = req.body;
    if (!item || qty == null) {
      return res.status(400).json({ message: "item and qty are required" });
    }

    const log = await WasteLog.create({
      item,
      qty,
      unit: unit || "kg",
      reason: reason || "Other",
      cost: cost ?? 0,
      staff: req.staff?.name || "Staff",
      staffId: req.staff?.id,
    });

    res.status(201).json({ log });
  } catch (err) {
    res.status(400).json({ message: "Error creating waste log", err: err.message });
  }
};

/* GET /api/staff/waste/stats */
export const getWasteStats = async (req, res) => {
  try {
    const { start, end } = dayRangeInTimeZone();

    const [allLogs, todayLogs] = await Promise.all([
      WasteLog.find(),
      WasteLog.find({ createdAt: { $gte: start, $lt: end } }),
    ]);

    const totalCost = allLogs.reduce((s, l) => s + l.cost, 0);
    const todayCost = todayLogs.reduce((s, l) => s + l.cost, 0);

    res.json({
      total: allLogs.length,
      today: todayLogs.length,
      totalCost: parseFloat(totalCost.toFixed(2)),
      todayCost: parseFloat(todayCost.toFixed(2)),
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching waste stats", err: err.message });
  }
};
