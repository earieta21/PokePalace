export function orderBowlSize(order) {
  if (order.base) {
    return order.bowlSize === "large"
      ? { title: "Tamaño del bowl", label: "GRANDE", detail: "3 proteínas · 120 g", tone: "large" }
      : { title: "Tamaño del bowl", label: "MEDIANO", detail: "1–2 proteínas · 100 g", tone: "medium" };
  }

  const bowlItems = (order.items ?? []).filter(
    (item) => item.category === "bowls" || /\bbowl\b/i.test(item.name ?? "")
  );
  if (bowlItems.length === 0) return null;

  const counts = bowlItems.reduce(
    (total, item) => {
      const quantity = Number.isInteger(item.qty) && item.qty > 0 ? item.qty : 1;
      const size = /\bgrande\b/i.test(item.name ?? "") ? "large" : "medium";
      total[size] += quantity;
      return total;
    },
    { medium: 0, large: 0 }
  );

  if (counts.medium > 0 && counts.large > 0) {
    return {
      title: "Tamaños del pedido",
      label: "MIXTO",
      detail: `${counts.medium} mediano${counts.medium === 1 ? "" : "s"} · ${counts.large} grande${counts.large === 1 ? "" : "s"}`,
      tone: "large",
    };
  }

  const isLarge = counts.large > 0;
  const quantity = isLarge ? counts.large : counts.medium;
  return {
    title: quantity === 1 ? "Tamaño del bowl" : "Tamaños del pedido",
    label: isLarge ? "GRANDE" : "MEDIANO",
    detail: `${quantity} bowl${quantity === 1 ? "" : "s"} · ${isLarge ? "120 g c/u" : "100 g c/u"}`,
    tone: isLarge ? "large" : "medium",
  };
}

function kitchenOrderTime(order) {
  const raw = order.scheduledPickupTime || order.createdAt;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

export function sortKitchenOrders(orders) {
  return [...orders].sort((a, b) => {
    if (a.status === "ready" && b.status !== "ready") return 1;
    if (a.status !== "ready" && b.status === "ready") return -1;
    return kitchenOrderTime(a) - kitchenOrderTime(b);
  });
}
