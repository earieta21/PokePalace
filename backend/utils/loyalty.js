import User from "../models/User.js";

// Nivel Oro: se calcula con lifetimePoints (solo sube), nunca con el saldo gastable
export const GOLD_TIER_MIN_POINTS = 300;
export const GOLD_POINTS_MULTIPLIER = 2;

// Saldo gastable: se resetea si el cliente no gana puntos nuevos en este tiempo
export const POINTS_INACTIVITY_MONTHS = 12;

// Código de premio ya canjeado: vence si el cliente no lo reclama en este tiempo
export const REDEMPTION_CODE_EXPIRY_DAYS = 90;

/* Resetea a 0 el saldo gastable de un usuario si lleva más de
   POINTS_INACTIVITY_MONTHS sin ganar puntos nuevos. No toca lifetimePoints
   (el nivel es un logro permanente). Atómico y seguro de llamar repetidas
   veces — el filtro $type:"date" evita afectar cuentas que nunca han
   ganado puntos (pointsLastEarnedAt sigue en null). */
export async function expireStalePoints(userId) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - POINTS_INACTIVITY_MONTHS);

  await User.updateOne(
    {
      _id: userId,
      points: { $gt: 0 },
      pointsLastEarnedAt: { $type: "date", $lt: cutoff },
    },
    { $set: { points: 0 } }
  );
}
