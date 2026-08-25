import { useState, useEffect, useContext, useCallback, useMemo, useRef } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import { API_URL } from "../../config";
import {
  PROTEIN_LABELS,
  BASE_LABELS,
  MARINADE_LABELS,
  COMPLEMENT_LABELS,
  SAUCE_LABELS,
  TOPPING_LABELS,
} from "../../order/OrderLabels";
import { orderTimingLabel } from "../orderTiming.js";
import { comboPalaceSelectionSummary } from "../../data/comboPalace";

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
  const label = (map, id) => map[id] ?? id;

  // Carrito de cliente/kiosco (1+ bowls y/o artículos) — cada línea se marca
  // por separado para que cocina no mezcle los ingredientes de 2 bowls.
  if (order.cartItems?.length) {
    const bowlCount = order.cartItems.filter((l) => l.kind === "bowl").length;
    let bowlNumber = 0;
    for (const line of order.cartItems) {
      if (line.kind === "item") {
        lines.push(`${line.name} ×${line.qty}`);
        if (line.catalogId === "combo-palace") {
          lines.push(`Incluye: ${comboPalaceSelectionSummary(line)}`);
        }
        continue;
      }
      bowlNumber += 1;
      lines.push(bowlCount > 1 ? `— Bowl ${bowlNumber} —` : "— Bowl —");
      const baseText = line.bases?.length > 1
        ? `${line.bases.map((id) => label(BASE_LABELS, id)).join(" + ")} (mitad y mitad)`
        : label(BASE_LABELS, line.base);
      lines.push(`Base: ${baseText}`);
      if (line.proteins?.length) {
        lines.push(`Proteínas: ${line.proteins.map((id) => label(PROTEIN_LABELS, id)).join(", ")}`);
      }
      lines.push(line.bowlSize === "large" ? "Bowl grande" : "Bowl mediano");
      if (line.extraScoopProteins?.length) {
        lines.push(`⚠️ SCOOP EXTRA: ${line.extraScoopProteins.map((id) => label(PROTEIN_LABELS, id)).join(", ")}`);
      }
      if (line.marinades?.length)
        lines.push(`Marinados: ${line.marinades.map((id) => label(MARINADE_LABELS, id)).join(", ")}`);
      if (line.complements?.length)
        lines.push(`Complementos: ${line.complements.map((id) => label(COMPLEMENT_LABELS, id)).join(", ")}`);
      if (line.sauces?.length)
        lines.push(`Salsas: ${line.sauces.map((id) => label(SAUCE_LABELS, id)).join(", ")}`);
      if (line.toppings?.length)
        lines.push(`Toppings: ${line.toppings.map((id) => label(TOPPING_LABELS, id)).join(", ")}`);
    }
    return lines.length ? lines : ["Bowl personalizado"];
  }

  if (order.items?.length) {
    // Los bowls rápidos (mediano/grande) no traen receta, pero desde que se
    // captura la proteína en caja sí se sabe qué preparar.
    lines.push(...order.items.map((i) => {
      const proteinSuffix = i.protein ? ` — ${label(PROTEIN_LABELS, i.protein)}` : "";
      const comboSuffix = i.catalogId === "combo-palace" ? ` — ${comboPalaceSelectionSummary(i)}` : "";
      return `${i.name}${proteinSuffix}${comboSuffix} ×${i.qty}`;
    }));
  }

  if (order.base) {
    const baseText = order.bases?.length > 1
      ? `${order.bases.map((id) => label(BASE_LABELS, id)).join(" + ")} (mitad y mitad)`
      : label(BASE_LABELS, order.base);
    lines.push(`Base: ${baseText}`);
    if (order.proteins?.length) {
      lines.push(`Proteínas: ${order.proteins.map((id) => label(PROTEIN_LABELS, id)).join(", ")}`);
    } else if (order.protein) {
      lines.push(`Proteína: ${order.protein}`);
    }
    lines.push(order.bowlSize === "large" ? "Bowl grande" : "Bowl mediano");
    if (order.extraScoopProteins?.length) {
      lines.push(`⚠️ SCOOP EXTRA: ${order.extraScoopProteins.map((id) => label(PROTEIN_LABELS, id)).join(", ")}`);
    }
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

function playNewOrderBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    // 3 short beeps — square wave is more piercing than triangle
    [0, 220, 440].forEach((delayMs) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.value = 1050;
      const t = ctx.currentTime + delayMs / 1000;
      gain.gain.setValueAtTime(0.75, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  } catch {
    // Audio is an optional alert; unsupported browsers still show the ticket.
  }
}

export default function KDSPage({ styles, role }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = useMemo(() => createStaffApi(staffToken), [staffToken]);

  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [alertCount, setAlertCount] = useState(0);
  const [screenFlash, setScreenFlash] = useState(false);
  const seenIds    = useRef(new Set());
  const firstLoad  = useRef(true);
  const alertTimer = useRef(null);
  const flashTimer = useRef(null);

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
          navigator.vibrate?.([300, 100, 300, 100, 300]);
          setAlertCount(newPending.length);
          setScreenFlash(true);
          clearTimeout(alertTimer.current);
          clearTimeout(flashTimer.current);
          alertTimer.current = setTimeout(() => setAlertCount(0), 6000);
          flashTimer.current = setTimeout(() => setScreenFlash(false), 900);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    load();
    // Respaldo de sondeo — la vía principal es la conexión en tiempo real de
    // abajo, esto solo cubre el rato en que esa conexión se esté reconectando.
    const id = setInterval(load, 5000);

    // iOS pausa los timers de una pestaña en segundo plano (pantalla
    // apagada/bloqueada) para ahorrar batería — el poll no corre mientras
    // tanto. Al volver a estar visible, se refresca de inmediato en vez de
    // esperar al siguiente tick.
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  // Conexión en tiempo real: el servidor avisa por esta vía en cuanto un
  // pedido cambia, sin depender de que un setInterval sobreviva al ahorro
  // de batería de iOS en una pantalla que casi nadie toca (la iPad de
  // cocina en acceso guiado nunca dispara visibilitychange porque nunca
  // deja de estar "visible"). Se usa fetch en vez de EventSource porque
  // EventSource no permite mandar el header de autorización.
  useEffect(() => {
    if (!staffToken) return;
    let cancelled = false;
    let retryTimer = null;
    const controller = new AbortController();

    const connect = async () => {
      try {
        const res = await fetch(`${API_URL}/api/staff/orders/events`, {
          headers: { Authorization: `Bearer ${staffToken}` },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sep;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const chunk = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            if (chunk.includes("orders_changed")) load();
          }
        }
      } catch {
        // red caída, servidor reiniciando, etc. — se reintenta solo.
      }
      if (!cancelled) retryTimer = setTimeout(connect, 3000);
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      controller.abort();
    };
  }, [staffToken, load]);

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
  const isKitchenOnly = role === "kitchen";

  const pending = orders.filter((o) => o.status !== "ready").length;

  return (
    <div>
      {/* Error de conexión/sesión — banner fijo y visible, para que el
          personal note de inmediato si el auto-refresco dejó de funcionar
          en vez de asumir que solo no hay pedidos nuevos. */}
      {error && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9997,
          background: "#dc2626", color: "#fff", textAlign: "center",
          padding: "10px 16px", fontWeight: 700, fontSize: 13,
        }}>
          ⚠️ No se pudo actualizar la cocina: {error} — toca «Actualizar» o vuelve a entrar con tu PIN si sigue.
        </div>
      )}

      {/* Screen flash on new order — visible even if not looking at the toast */}
      {screenFlash && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "#10b981", pointerEvents: "none",
          animation: "screenFlash 0.9s ease-out forwards",
        }}>
          <style>{`
            @keyframes screenFlash {
              0%   { opacity: 0.45; }
              100% { opacity: 0; }
            }
          `}</style>
        </div>
      )}

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
                  <span className={styles.kdsTimer}>{orderTimingLabel(order)}</span>
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
                    isKitchenOnly ? (
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--p-muted)" }}>
                        Esperando entrega en caja
                      </span>
                    ) : (
                      <button className={`${styles.kdsBtnReady} ${styles.kdsBtnDismiss}`} onClick={() => dismiss(order)}>
                        Marcar Completado
                      </button>
                    )
                  ) : (
                    <button className={styles.kdsBtnReady} onClick={() => advance(order)}>
                      {order.status === "pending" ? "Iniciar Preparación" : "Marcar Listo"}
                    </button>
                  )}
                  {!isKitchenOnly && (
                    confirming === order._id ? (
                      <div className={styles.kdsCancelConfirm}>
                        <span>¿Cancelar orden?</span>
                        <button className={styles.kdsCancelYes} onClick={() => { cancel(order); setConfirming(null); }}>Sí</button>
                        <button className={styles.kdsCancelNo}  onClick={() => setConfirming(null)}>No</button>
                      </div>
                    ) : (
                      <button className={styles.kdsBtnCancel} onClick={() => setConfirming(order._id)}>
                        Cancelar orden
                      </button>
                    )
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
