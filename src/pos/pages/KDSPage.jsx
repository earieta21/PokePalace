import { useState, useEffect, useContext, useCallback, useRef } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import {
  PROTEIN_LABELS,
  BASE_LABELS,
  MARINADE_LABELS,
  COMPLEMENT_LABELS,
  SAUCE_LABELS,
  TOPPING_LABELS,
} from "../../order/OrderLabels";

const STATUS_CFG = {
  pending:   { cls: "badgeYellow", label: "Nuevo" },
  preparing: { cls: "badgeBlue",   label: "Preparando" },
  ready:     { cls: "badgeGreen",  label: "Listo" },
};

const FULFILLMENT_LABEL = {
  pickup: "Recoger",
  dine_in: "Comer aqui",
  delivery: "Delivery",
};

const PAYMENT_LABEL = {
  pay_at_pickup: "Paga al recoger",
  cash: "Efectivo",
  card_terminal: "Tarjeta",
  online: "Online",
};

function orderLines(order) {
  const lines = [];

  if (order.items?.length) {
    lines.push(...order.items.map((i) => `${i.name} ×${i.qty}`));
  }

  const label = (map, id) => map[id] ?? id;

  if (order.base) {
    lines.push(`Base: ${label(BASE_LABELS, order.base)}`);
    if (order.proteins?.length) {
      lines.push(`Proteínas: ${order.proteins.map((id) => label(PROTEIN_LABELS, id)).join(", ")}`);
    } else if (order.protein) {
      lines.push(`Proteína: ${order.protein}`);
    }
    lines.push(order.bowlSize === "large" ? "Bowl grande" : "Bowl normal");
    if (order.marinades?.length)
      lines.push(`Marinados: ${order.marinades.map((id) => label(MARINADE_LABELS, id)).join(", ")}`);
    if (order.complements?.length)
      lines.push(`Complementos: ${order.complements.map((id) => label(COMPLEMENT_LABELS, id)).join(", ")}`);
    if (order.sauces?.length)
      lines.push(`Salsas: ${order.sauces.map((id) => label(SAUCE_LABELS, id)).join(", ")}`);
    if (order.toppings?.length)
      lines.push(`Toppings: ${order.toppings.map((id) => label(TOPPING_LABELS, id)).join(", ")}`);
  }

  return lines.length ? lines : ["Bowl personalizado"];
}

function elapsed(createdAt) {
  const secs = Math.floor((Date.now() - new Date(createdAt)) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function playNewOrderBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 230].forEach((delayMs) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "triangle";
      osc.frequency.value = 880;
      const t = ctx.currentTime + delayMs / 1000;
      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch {}
}

export default function KDSPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [alertCount, setAlertCount] = useState(0);
  const seenIds    = useRef(new Set());
  const firstLoad  = useRef(true);
  const alertTimer = useRef(null);

  const load = useCallback(() => {
    api.get("/api/staff/orders?status=pending,preparing,ready&limit=30")
      .then((d) => {
        const incoming = d.orders ?? [];
        setOrders(incoming);

        if (firstLoad.current) {
          firstLoad.current = false;
          incoming.forEach((o) => seenIds.current.add(o._id));
          return;
        }

        const newPending = incoming.filter(
          (o) => o.status === "pending" && !seenIds.current.has(o._id)
        );
        incoming.forEach((o) => seenIds.current.add(o._id));

        if (newPending.length > 0) {
          playNewOrderBeep();
          navigator.vibrate?.([300, 100, 300]);
          setAlertCount(newPending.length);
          clearTimeout(alertTimer.current);
          alertTimer.current = setTimeout(() => setAlertCount(0), 6000);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const advance = async (order) => {
    const next =
      order.status === "pending"   ? "preparing" :
      order.status === "preparing" ? "ready"     : null;
    if (!next) return;
    try {
      const { order: updated } = await api.patch(
        `/api/staff/orders/${order._id}/status`, { status: next }
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

  const cancel = async (order) => {
    try {
      await api.patch(`/api/staff/orders/${order._id}/status`, { status: "cancelled" });
      setOrders((prev) => prev.filter((o) => o._id !== order._id));
    } catch (e) { setError(e.message); }
  };

  const [confirming, setConfirming] = useState(null);

  const pending = orders.filter((o) => o.status !== "ready").length;

  return (
    <div>
      {/* New order alert toast */}
      {alertCount > 0 && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, background: "#10b981", color: "#fff",
          padding: "12px 24px", borderRadius: 999,
          fontWeight: 800, fontSize: 15, boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          display: "flex", alignItems: "center", gap: 8,
          animation: "alertIn 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        }}>
          <span style={{ fontSize: 20 }}>🛎</span>
          {alertCount === 1 ? "¡Pedido nuevo!" : `¡${alertCount} pedidos nuevos!`}
          <style>{`
            @keyframes alertIn {
              from { opacity: 0; transform: translateX(-50%) scale(0.85); }
              to   { opacity: 1; transform: translateX(-50%) scale(1); }
            }
          `}</style>
        </div>
      )}

      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Pantalla de Cocina</h1>
          <p className={styles.pageSubtitle}>
            {loading ? "Cargando…" : `${pending} pendientes · ${orders.length} total`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {error && <span style={{ color: "red", fontSize: 12 }}>{error}</span>}
          <button className={styles.btnGhost} onClick={load}>Actualizar</button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "var(--p-muted)", fontSize: 13 }}>Cargando órdenes…</p>
      ) : orders.length === 0 ? (
        <div className={styles.card} style={{ textAlign: "center", padding: 48, color: "var(--p-muted)" }}>
          <p style={{ fontSize: 24, marginBottom: 8 }}>🍱</p>
          <p style={{ fontWeight: 600 }}>Sin órdenes activas por ahora</p>
        </div>
      ) : (
        <div className={styles.kdsGrid}>
          {orders.map((order) => {
            const cfg = STATUS_CFG[order.status] ?? STATUS_CFG.pending;
            const isReady = order.status === "ready";
            const lines = orderLines(order);
            const cliente =
              order.customer ||
              order.user?.name ||
              order.user?.email?.split("@")[0] ||
              "Cliente";

            return (
              <div key={order._id} className={`${styles.kdsCard} ${isReady ? styles.kdsCardReady : ""}`}>
                <div className={styles.kdsHeader}>
                  <span className={styles.kdsNum}>#{order._id.slice(-5).toUpperCase()}</span>
                  <span className={`${styles.badge} ${styles[cfg.cls]}`}>{cfg.label}</span>
                  <span className={styles.kdsTimer}>{elapsed(order.createdAt)}</span>
                </div>
                <div className={styles.kdsBody}>
                  <p style={{ fontSize: 11, color: "var(--p-muted)", marginBottom: 6 }}>{cliente}</p>
                  <p style={{ fontSize: 11, color: "var(--p-muted)", marginBottom: 8 }}>
                    {FULFILLMENT_LABEL[order.fulfillment] ?? "Recoger"}
                    {order.phone ? ` · ${order.phone}` : ""}
                    {order.paymentMethod ? ` · ${PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}` : ""}
                  </p>
                  {order.notes && (
                    <p style={{ fontSize: 12, color: "var(--p-text)", marginBottom: 8, fontWeight: 700 }}>
                      Nota: {order.notes}
                    </p>
                  )}
                  {lines.map((line) => (
                    <div key={line} className={styles.kdsItem}><span>{line}</span></div>
                  ))}
                </div>
                <div className={styles.kdsFooter}>
                  {isReady ? (
                    <button className={`${styles.kdsBtnReady} ${styles.kdsBtnDismiss}`} onClick={() => dismiss(order)}>
                      Marcar Completado
                    </button>
                  ) : (
                    <button className={styles.kdsBtnReady} onClick={() => advance(order)}>
                      {order.status === "pending" ? "Iniciar Preparación" : "Marcar Listo"}
                    </button>
                  )}
                  {confirming === order._id ? (
                    <div className={styles.kdsCancelConfirm}>
                      <span>¿Cancelar orden?</span>
                      <button className={styles.kdsCancelYes} onClick={() => { cancel(order); setConfirming(null); }}>Sí</button>
                      <button className={styles.kdsCancelNo}  onClick={() => setConfirming(null)}>No</button>
                    </div>
                  ) : (
                    <button className={styles.kdsBtnCancel} onClick={() => setConfirming(order._id)}>
                      Cancelar orden
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
