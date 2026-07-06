import { useState, useEffect, useContext, useCallback } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import { PROTEIN_LABELS } from "../../order/OrderLabels";

const STATUS_CFG = {
  pending:   { cls: "badgeYellow", label: "Nuevo" },
  preparing: { cls: "badgeBlue",   label: "Preparando" },
  ready:     { cls: "badgeGreen",  label: "Listo" },
};

const FULFILLMENT_LABEL = {
  pickup: "Recoger",
  dine_in: "En restaurante",
  delivery: "Delivery",
};

function elapsed(createdAt) {
  const secs = Math.floor((Date.now() - new Date(createdAt)) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function itemSummary(order) {
  const segments = [];

  if (order.items?.length) {
    segments.push(order.items.map((i) => `${i.name} ×${i.qty}`).join(", "));
  }

  if (order.base) {
    const parts = [];
    if (order.proteins?.length) parts.push(order.proteins.map((id) => PROTEIN_LABELS[id] ?? id).join(", "));
    else if (order.protein) parts.push(order.protein);
    parts.push(`en ${order.base}`);
    const size = order.bowlSize === "large" ? "Bowl grande" : "Bowl normal";
    segments.push(`${size}: ${parts.join(" ")}`);
  }

  return segments.join(" + ") || "Bowl personalizado";
}

export default function ActiveOrdersPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const load = useCallback(() => {
    api.get("/api/staff/orders?status=pending,preparing,ready&limit=50")
      .then((d) => setOrders(d.orders ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const markReady = async (order) => {
    try {
      const { order: updated } = await api.patch(
        `/api/staff/orders/${order._id}/status`, { status: "ready" }
      );
      setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
    } catch (e) { setError(e.message); }
  };

  const dismiss = async (order) => {
    try {
      await api.patch(`/api/staff/orders/${order._id}/status`, { status: "completed" });
      setOrders((prev) => prev.filter((o) => o._id !== order._id));
    } catch (e) { setError(e.message); }
  };

  const markPaid = async (order) => {
    try {
      const { order: updated } = await api.patch(`/api/staff/orders/${order._id}/pay`, {});
      setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Órdenes Activas</h1>
          <p className={styles.pageSubtitle}>
            {loading
              ? "Cargando…"
              : `${orders.filter((o) => o.status !== "ready").length} en proceso · ${orders.filter((o) => o.status === "ready").length} listos`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {error && <span style={{ color: "red", fontSize: 12 }}>{error}</span>}
          <button className={styles.btnGhost} onClick={load}>Actualizar</button>
        </div>
      </div>

      {!loading && (
        <div className={styles.statsRow}>
          {["pending", "preparing", "ready"].map((s) => {
            const { cls, label } = STATUS_CFG[s];
            return (
              <div key={s} className={styles.statCard}>
                <p className={styles.statLabel}>{label}</p>
                <p className={styles.statValue}>{orders.filter((o) => o.status === s).length}</p>
                <span className={`${styles.badge} ${styles[cls]}`} style={{ marginTop: 6 }}>{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--p-muted)", fontSize: 13 }}>Cargando…</p>
      ) : orders.length === 0 ? (
        <div className={styles.card} style={{ textAlign: "center", padding: 48, color: "var(--p-muted)" }}>
          <p style={{ fontSize: 24, marginBottom: 8 }}>🎉</p>
          <p style={{ fontWeight: 600 }}>Al corriente — sin órdenes activas</p>
        </div>
      ) : (
        <div className={styles.orderCardsGrid}>
          {orders.map((order) => {
            const { cls, label } = STATUS_CFG[order.status] ?? STATUS_CFG.pending;
            const cliente = order.customer || order.user?.name || order.user?.email?.split("@")[0] || "Cliente";
            return (
              <div key={order._id} className={styles.orderCard}>
                <div className={styles.orderCardTop}>
                  <span className={styles.orderCardId}>#{order._id.slice(-5).toUpperCase()}</span>
                  <span className={`${styles.badge} ${styles[cls]}`}>{label}</span>
                  <span className={styles.orderCardTimer}>{elapsed(order.createdAt)}</span>
                </div>
                <div className={styles.orderCardBody}>
                  <p className={styles.orderCardCustomer}>{cliente}</p>
                  <p className={styles.orderCardItems}>
                    {FULFILLMENT_LABEL[order.fulfillment] ?? "Recoger"}
                    {order.phone ? ` · ${order.phone}` : ""}
                  </p>
                  <p className={styles.orderCardItems}>{itemSummary(order)}</p>
                  {order.notes && <p className={styles.orderCardItems}>Nota: {order.notes}</p>}
                  {order.total != null && (
                    <p className={styles.orderCardTotal}>${order.total.toFixed(2)}</p>
                  )}
                </div>
                <div className={styles.orderCardFooter}>
                  {order.paymentStatus === "paid" ? (
                    <span className={styles.paidBadge}>✓ Pagado</span>
                  ) : (
                    <button className={styles.btnPay} onClick={() => markPaid(order)}>
                      Cobrado{order.total != null ? ` $${order.total.toLocaleString("es-MX")} MXN` : ""}
                    </button>
                  )}
                  {order.status === "ready" ? (
                    <button className={styles.btnGhost} style={{ flex: 1 }} onClick={() => dismiss(order)}>
                      Descartar
                    </button>
                  ) : (
                    <button
                      className={styles.btnPrimary} style={{ flex: 1 }}
                      disabled={order.status !== "preparing"}
                      onClick={() => markReady(order)}
                    >
                      {order.status === "pending" ? "Esperando…" : "Marcar Listo"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
