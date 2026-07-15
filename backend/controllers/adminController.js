import Order from "../models/Order.js";
import Expense from "../models/Expense.js";
import WasteLog from "../models/WasteLog.js";
import Redemption from "../models/Redemption.js";
import TimeRecord from "../models/TimeRecord.js";
import TempRecord from "../models/TempRecord.js";
import ChecklistRecord from "../models/ChecklistRecord.js";
import ErrorLog from "../models/ErrorLog.js";
import User from "../models/User.js";
import PromoCode from "../models/PromoCode.js";

/* Reinicio de datos de prueba antes de la apertura.
   NO toca: clientes (Users), empleados, inventario, horarios, promos ni
   configuración — solo el historial transaccional que se generó probando.
   `loyaltyPoints` no borra usuarios: pone sus puntos en cero. */

const RESETTABLE = {
  orders:        () => Order.deleteMany({}),
  expenses:      () => Expense.deleteMany({}),
  waste:         () => WasteLog.deleteMany({}),
  redemptions:   () => Redemption.deleteMany({}),
  timeRecords:   () => TimeRecord.deleteMany({}),
  tempRecords:   () => TempRecord.deleteMany({}),
  checklists:    () => ChecklistRecord.deleteMany({}),
  errorLogs:     () => ErrorLog.deleteMany({}),
  loyaltyPoints: () => User.updateMany({}, { $set: { points: 0 } }),
  promoUses:     () => PromoCode.updateMany({}, { $set: { usedCount: 0 } }),
};

const COUNTERS = {
  orders:        () => Order.countDocuments(),
  expenses:      () => Expense.countDocuments(),
  waste:         () => WasteLog.countDocuments(),
  redemptions:   () => Redemption.countDocuments(),
  timeRecords:   () => TimeRecord.countDocuments(),
  tempRecords:   () => TempRecord.countDocuments(),
  checklists:    () => ChecklistRecord.countDocuments(),
  errorLogs:     () => ErrorLog.countDocuments(),
  loyaltyPoints: () => User.countDocuments({ points: { $gt: 0 } }),
  promoUses:     () => PromoCode.countDocuments({ usedCount: { $gt: 0 } }),
};

const CONFIRM_PHRASE = "BORRAR DATOS DE PRUEBA";

/* GET /api/staff/admin/test-data — vista previa: cuánto hay en cada colección */
export const previewTestData = async (req, res) => {
  try {
    const entries = await Promise.all(
      Object.entries(COUNTERS).map(async ([name, count]) => [name, await count()])
    );
    res.json({ counts: Object.fromEntries(entries), confirmPhrase: CONFIRM_PHRASE });
  } catch (err) {
    res.status(500).json({ message: "Error al contar datos", err: err.message });
  }
};

/* POST /api/staff/admin/reset-test-data
   body: { confirm: "BORRAR DATOS DE PRUEBA", collections: ["orders", ...] } */
export const resetTestData = async (req, res) => {
  try {
    const { confirm, collections } = req.body || {};
    if (confirm !== CONFIRM_PHRASE) {
      return res.status(400).json({ message: `Escribe la frase de confirmación exacta: "${CONFIRM_PHRASE}"` });
    }
    if (!Array.isArray(collections) || collections.length === 0) {
      return res.status(400).json({ message: "Indica qué colecciones reiniciar", allowed: Object.keys(RESETTABLE) });
    }
    const invalid = collections.filter((c) => !RESETTABLE[c]);
    if (invalid.length > 0) {
      return res.status(400).json({ message: `Colecciones no permitidas: ${invalid.join(", ")}`, allowed: Object.keys(RESETTABLE) });
    }

    const results = {};
    for (const name of collections) {
      const r = await RESETTABLE[name]();
      results[name] = r.deletedCount ?? r.modifiedCount ?? 0;
    }

    res.json({ ok: true, reset: results, by: req.staff?.name || req.staff?.email || "staff" });
  } catch (err) {
    res.status(500).json({ message: "Error al reiniciar datos", err: err.message });
  }
};
