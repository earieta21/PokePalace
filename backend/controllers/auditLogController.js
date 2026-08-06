import AuditLog from "../models/AuditLog.js";

/* GET /api/staff/audit-log?entity=&entityId=&from=&to=&limit=&skip= */
export const getAuditLog = async (req, res) => {
  try {
    const { entity, entityId, from, to } = req.query;
    const filter = {};
    if (entity) filter.entity = entity;
    if (entityId) filter.entityId = entityId;
    if (from || to) {
      filter.createdAt = {
        ...(from ? { $gte: new Date(from) } : {}),
        ...(to ? { $lte: new Date(to) } : {}),
      };
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Number(req.query.skip) || 0;
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ message: "Error fetching audit log", err: err.message });
  }
};