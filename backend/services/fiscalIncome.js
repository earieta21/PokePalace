// Recibe exclusivamente las órdenes cobradas y no canceladas del periodo.
// Cada venta pertenece a un solo grupo; el delivery propio conserva su
// método real de cobro (p. ej. efectivo), no se cuenta como app.
export function buildFiscalIncome(orders) {
  const groups = [
    { id: "cash", label: "Efectivo", movimientos: [] },
    { id: "delivery_app", label: "Aplicaciones de delivery", movimientos: [] },
    { id: "other", label: "Otros pagos (tarjeta, en línea y otros)", movimientos: [] },
  ];
  const methods = new Map();
  const platforms = new Map();
  let totalCents = 0;

  for (const order of orders) {
    const method = order.paymentMethod || "pay_at_pickup";
    const cents = Math.round(order.total * 100);
    const group = groups.find((g) => g.id === method) || groups[2];
    group.movimientos.push({
      id: String(order._id),
      fecha: new Date(order.createdAt).toISOString(),
      metodo: method,
      plataforma: order.deliveryPlatform || null,
      total: cents / 100,
    });
    methods.set(method, (methods.get(method) || 0) + cents);
    if (method === "delivery_app") {
      const platform = order.deliveryPlatform || "unknown";
      const entry = platforms.get(platform) || { cents: 0, ordenes: 0 };
      entry.cents += cents;
      entry.ordenes += 1;
      platforms.set(platform, entry);
    }
    totalCents += cents;
  }

  return {
    total: totalCents / 100,
    porMetodo: Object.fromEntries([...methods].map(([key, cents]) => [key, cents / 100])),
    grupos: groups.map((group) => ({
      ...group,
      total: group.movimientos.reduce((sum, m) => sum + Math.round(m.total * 100), 0) / 100,
      ordenes: group.movimientos.length,
    })),
    porPlataforma: [...platforms].map(([id, entry]) => ({
      id, total: entry.cents / 100, ordenes: entry.ordenes,
    })),
  };
}
