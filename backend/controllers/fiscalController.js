import { zonedParts } from "../utils/timeZone.js";
import { computeFiscalSummary } from "../services/fiscalCalc.js";

/* Asistente fiscal — calibrado al régimen real del dueño (Constancia SAT):
   persona física en RESICO, actividad "Restaurantes de comida para llevar".
   Estimaciones informativas para preparar la declaración del día 17; no
   sustituyen al contador. El cálculo en sí vive en services/fiscalCalc.js,
   compartido con el recordatorio automático (utils/fiscalReminder.js). */

/* GET /api/staff/fiscal?month=YYYY-MM — resumen del mes en zona Tijuana */
export const getFiscalSummary = async (req, res) => {
  try {
    const now = zonedParts(new Date());
    let year = now.year;
    let month = now.month;
    const requested = /^(\d{4})-(\d{2})$/.exec(String(req.query.month || ""));
    if (requested) {
      year = Number(requested[1]);
      month = Number(requested[2]);
      if (month < 1 || month > 12) {
        return res.status(400).json({ message: "Mes inválido" });
      }
    }

    const summary = await computeFiscalSummary(year, month);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ message: "Error al generar el resumen fiscal", err: err.message });
  }
};
