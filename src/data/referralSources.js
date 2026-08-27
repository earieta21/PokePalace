// Canales de publicidad que puede elegir el cajero al preguntarle al cliente
// "¿cómo nos conociste?". Los valores (id) deben coincidir exactamente con
// REFERRAL_SOURCES en backend/config/posCatalog.js.
export const REFERRAL_SOURCES = [
  { id: "instagram", label: "Instagram", icon: "📷" },
  { id: "facebook", label: "Facebook", icon: "📘" },
  { id: "tiktok", label: "TikTok", icon: "🎵" },
  { id: "google", label: "Google / Internet", icon: "🔎" },
  { id: "recomendacion", label: "Recomendación", icon: "🗣️" },
  { id: "ubicacion", label: "Pasando por el local", icon: "📍" },
  { id: "otro", label: "Otro", icon: "✳️" },
];

export const REFERRAL_SOURCE_LABELS = Object.fromEntries(
  REFERRAL_SOURCES.map((source) => [source.id, source.label])
);
