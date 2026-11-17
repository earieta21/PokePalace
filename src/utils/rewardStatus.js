export function rewardStatus(reward, now = Date.now()) {
  if (!reward || !["active", "used", "expired", "cancelled"].includes(reward.status)) return "unavailable";
  if (reward.status === "active" && reward.expiresAt) {
    const expiry = Date.parse(reward.expiresAt);
    if (!Number.isFinite(expiry)) return "unavailable";
    if (expiry <= now) return "expired";
  }
  return reward.status;
}

export function rewardStatusLabel(status, language = "es") {
  const labels = language === "en"
    ? { active: "Active", used: "Used", expired: "Expired", cancelled: "Cancelled", unavailable: "Unavailable" }
    : { active: "Activo", used: "Usado", expired: "Vencido", cancelled: "Cancelado", unavailable: "No disponible" };
  return labels[status] || labels.unavailable;
}
