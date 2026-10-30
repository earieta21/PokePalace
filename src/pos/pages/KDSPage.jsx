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
import { DELIVERY_PLATFORM_LABELS } from "../../data/deliveryPlatforms.js";

// `card` pinta la franja de arriba de la comanda con el color del estado.
const STATUS_CFG = {
  pending:   { cls: "badgeYellow", card: "kdsCardPending",   label: "Nuevo" },
  preparing: { cls: "badgeBlue",   card: "kdsCardPreparing", label: "Preparando" },
  ready:     { cls: "badgeGreen",  card: "kdsCardReady",     label: "Listo" },
};

const FULFILLMENT_LABEL = {
  pickup: "Recoger",
  dine_in: "Comer aquí",
  delivery: "Delivery",
};

// Lo que lleva cada tamaño, para que cocina no tenga que deducirlo.
const SIZE_INFO = {
  large: { label: "grande", grams: "120 g de proteína" },
  normal: { label: "mediano", grams: "100 g de proteína" },
};

const PAID_LABEL = {
  cash: "Efectivo",
  card_terminal: "Tarjeta",
  online: "En línea",
  delivery_app: "App de delivery",
};

const money = (value) => `$${Number(value).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;

// Total y estado del cobro. Cocina (rol kitchen) no recibe estos datos del
// servidor, así que en su pantalla no aparece la línea.
function paymentInfo(order) {
  if (order.total == null && !order.paymentStatus) return null;
  if (order.paymentStatus === "paid") {
    return { paid: true, text: `Pagado${PAID_LABEL[order.paymentMethod] ? ` · ${PAID_LABEL[order.paymentMethod]}` : ""}`, total: order.total };
  }
  return { paid: false, text: "Por cobrar en caja", total: order.total };
}

const label = (map, id) => map[id] ?? id;
const labelList = (map, ids) => ids.map((id) => label(map, id)).join(", ");

// Un bowl (del carrito, del 2x1 o de los campos planos del POS) siempre en
// las mismas filas y en el mismo orden, para que cocina lea igual cada
// comanda. Lo que cambia la preparación (mitad y mitad, scoop extra) va
// aparte como alerta.
function bowlTicket(bowl, { proteinText = null } = {}) {
  const rows = [];
  const alerts = [];
  const isHalfHalf = bowl.bases?.length > 1;
  if (isHalfHalf) {
    rows.push({ label: "Base", value: bowl.bases.map((id) => label(BASE_LABELS, id)).join(" + ") });
    alerts.push("Mitad y mitad de base");
  } else if (bowl.base) {
    rows.push({ label: "Base", value: label(BASE_LABELS, bowl.base) });
  }
  const protein = proteinText
    ?? (bowl.proteins?.length ? labelList(PROTEIN_LABELS, bowl.proteins) : null)
    ?? (bowl.protein ? label(PROTEIN_LABELS, bowl.protein) : null);
  if (protein) rows.push({ label: "Proteína", value: protein });
  if (bowl.extraScoopProteins?.length) {
    alerts.push(`Scoop extra: ${labelList(PROTEIN_LABELS, bowl.extraScoopProteins)}`);
  }
  if (bowl.marinades?.length) rows.push({ label: "Marinado", value: labelList(MARINADE_LABELS, bowl.marinades) });
  if (bowl.complements?.length) rows.push({ label: "Complementos", value: labelList(COMPLEMENT_LABELS, bowl.complements) });
  if (bowl.sauces?.length) rows.push({ label: "Salsas", value: labelList(SAUCE_LABELS, bowl.sauces) });
  if (bowl.toppings?.length) rows.push({ label: "Toppings", value: labelList(TOPPING_LABELS, bowl.toppings) });
  return { rows, alerts };
}

// La comanda separada en bowls (cada uno en su bloque, para no mezclar los
// ingredientes de dos bowls) y el resto de productos con su cantidad.
function orderTicket(order) {
  const bowls = [];
  const others = [];

  // Carrito de cliente/kiosco. Esos pedidos también copian el primer bowl en
  // los campos planos, así que aquí se ignoran.
  if (order.cartItems?.length) {
    for (const line of order.cartItems) {
      if (line.kind === "item") {
        others.push({
          qty: line.qty || 1,
          name: line.name,
          detail: line.catalogId === "combo-palace" ? `Incluye: ${comboPalaceSelectionSummary(line)}` : null,
        });
      } else if (line.kind === "promo2x1") {
        const proteinText = `${label(PROTEIN_LABELS, line.protein)} (60 g)`;
        for (const bowl of line.bowls || []) bowls.push({ tags: ["2x1"], ...bowlTicket(bowl, { proteinText }) });
      } else {
        bowls.push({ size: line.bowlSize, ...bowlTicket(line) });
      }
    }
  } else {
    // POS: artículos del catálogo (los bowls rápidos traen la proteína que
    // capturó caja) y, si se armó uno, el bowl personalizado en campos planos.
    for (const item of order.items || []) {
      const detail = [
        item.detail,
        item.proteins?.length ? item.proteins.map((id) => label(PROTEIN_LABELS, id)).join(", ") : item.protein && label(PROTEIN_LABELS, item.protein),
        item.complement && label(COMPLEMENT_LABELS, item.complement),
        item.sauce && label(SAUCE_LABELS, item.sauce),
        item.catalogId === "combo-palace" && comboPalaceSelectionSummary(item),
      ].filter(Boolean).join(" · ");
      others.push({ qty: item.qty || 1, name: item.name, detail: detail || null });
    }
    if (order.base || order.bases?.length > 1) bowls.push({ size: order.bowlSize, ...bowlTicket(order) });
  }

  if (!bowls.length && !others.length) others.push({ qty: 1, name: "Bowl personalizado", detail: null });

  const gifts = order.rewardExtraTopping
    ? [`Premio: topping extra de ${label(TOPPING_LABELS, order.rewardExtraTopping)}`]
    : [];
  return { bowls, others, gifts };
}

// Pedidos programados se ordenan por su hora de recoger; el resto, por
// llegada. Así la comanda más urgente siempre queda primero.
const dueAt = (order) => new Date(order.scheduledPickupTime || order.createdAt).getTime() || 0;
const byDue = (a, b) => dueAt(a) - dueAt(b);

// Un pedido tarda unos 12 minutos. El reloj se pinta de ámbar un poco antes
// (ya debería estar por salir) y de rojo cuando ya se pasó de lo normal.
const LATE_WARN_MIN = 10;
const LATE_ALERT_MIN = 15;

function timerClass(order, now, styles) {
  if (order.status === "ready" || order.scheduledPickupTime) return "";
  const minutes = (now - new Date(order.createdAt).getTime()) / 60000;
  if (minutes >= LATE_ALERT_MIN) return styles.kdsTimerLate;
  if (minutes >= LATE_WARN_MIN) return styles.kdsTimerWarn;
  return "";
}

function TicketBowl({ bowl, title, styles }) {
  const size = SIZE_INFO[bowl.size === "large" ? "large" : bowl.size ? "normal" : ""];
  return (
    <section className={styles.kdsBowl}>
      <div className={styles.kdsBowlHead}>
        <span className={styles.kdsBowlTitle}>
          {title}{size && <> · <span className={bowl.size === "large" ? styles.kdsSizeLarge : styles.kdsSize}>{size.label.toUpperCase()}</span></>}
        </span>
        {size && <span className={`${styles.kdsTag} ${bowl.size === "large" ? styles.kdsTagStrong : ""}`}>{size.grams}</span>}
        {bowl.tags?.map((tag) => <span key={tag} className={styles.kdsTag}>{tag}</span>)}
      </div>
      {bowl.alerts.map((alert) => (
        <p key={alert} className={styles.kdsAlert}>⚠️ {alert}</p>
      ))}
      <dl className={styles.kdsRows}>
        {bowl.rows.map((row) => (
          <div key={row.label} className={styles.kdsRow}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
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

  // El reloj de cada comanda avanza aunque no llegue nada nuevo.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Lo más antiguo primero: las comandas nuevas se agregan al final en vez de
  // empujar a las que ya se están preparando. Las listas van en su sección.
  const active = orders.filter((o) => o.status !== "ready").sort(byDue);
  const ready = orders.filter((o) => o.status === "ready").sort(byDue);

  const renderCard = (order) => {
    const cfg = STATUS_CFG[order.status] ?? STATUS_CFG.pending;
    const isReady = order.status === "ready";
    const ticket = orderTicket(order);
    const cliente =
      order.customer ||
      order.user?.name ||
      order.user?.email?.split("@")[0] ||
      "Cliente";
    const fulfillment = [
      FULFILLMENT_LABEL[order.fulfillment] ?? "Recoger",
      order.deliveryPlatform ? DELIVERY_PLATFORM_LABELS[order.deliveryPlatform] ?? order.deliveryPlatform : null,
    ].filter(Boolean).join(" · ");
    const payment = paymentInfo(order);
    const chipClass =
      order.fulfillment === "delivery" ? styles.kdsChipDelivery
      : order.fulfillment === "dine_in" ? styles.kdsChipDineIn
      : "";

    return (
      <article key={order._id} className={`${styles.kdsCard} ${styles[cfg.card] ?? ""}`}>
        <header className={styles.kdsHeader}>
          <div className={styles.kdsHeadTop}>
            <span className={styles.kdsNum}>
              {order.externalDisplayId ? `UE ${order.externalDisplayId}` : `#${order._id.slice(-5).toUpperCase()}`}
            </span>
            <span className={`${styles.kdsTimer} ${timerClass(order, now, styles)}`}>{orderTimingLabel(order, now)}</span>
          </div>
          <div className={styles.kdsHeadMeta}>
            <span className={styles.kdsCustomer}>{cliente}</span>
            <span className={`${styles.kdsChip} ${chipClass}`}>{fulfillment}</span>
            <span className={`${styles.badge} ${styles[cfg.cls]}`}>{cfg.label}</span>
          </div>
          {payment && (
            <div className={`${styles.kdsPay} ${payment.paid ? styles.kdsPayPaid : styles.kdsPayDue}`}>
              <span>{payment.text}</span>
              {payment.total != null && <strong>{money(payment.total)}</strong>}
            </div>
          )}
        </header>
        <div className={styles.kdsBody}>
          {order.notes && <p className={styles.kdsNoteBox}>📝 {order.notes}</p>}
          {ticket.gifts.map((gift) => (
            <p key={gift} className={`${styles.kdsAlert} ${styles.kdsAlertGift}`}>🎁 {gift}</p>
          ))}
          {ticket.bowls.map((bowl, i) => (
            <TicketBowl
              key={i}
              bowl={bowl}
              title={ticket.bowls.length > 1 ? `Bowl ${i + 1} de ${ticket.bowls.length}` : "Bowl"}
              styles={styles}
            />
          ))}
          {ticket.others.length > 0 && (
            <div>
              {ticket.bowls.length > 0 && <p className={styles.kdsOthersTitle}>También lleva</p>}
              <ul className={styles.kdsOtherList}>
                {ticket.others.map((item, i) => (
                  <li key={i} className={styles.kdsOther}>
                    <span className={styles.kdsQty}>{item.qty}×</span>
                    <span>
                      <strong>{item.name}</strong>
                      {item.detail && <small>{item.detail}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
      </article>
    );
  };

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
            {loading ? "Cargando…" : `${active.length} por preparar · ${ready.length} listos`}
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
        <>
          {active.length > 0 ? (
            <div className={styles.kdsGrid}>{active.map(renderCard)}</div>
          ) : (
            <p className={styles.kdsEmptyActive}>No hay pedidos por preparar.</p>
          )}
          {ready.length > 0 && (
            <>
              <h2 className={styles.kdsSectionTitle}>Listos para entregar · {ready.length}</h2>
              <div className={styles.kdsGrid}>{ready.map(renderCard)}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
