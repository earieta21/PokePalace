import { useCallback, useEffect, useRef, useState, useContext } from "react";
import { useParams, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../config";
import { GOOGLE_REVIEW_URL } from "../config";
import { getItemLabel } from "../order/OrderLabels";
import { useLanguage } from "../i18n/LanguageContext";
import { clearActiveOrder } from "../components/ActiveOrderBanner";
import styles from "./OrderTracking.module.css";

const STEP_CONFIG = [
  { key: "pending", icon: "📋", labelKey: "tracking.received", descKey: "tracking.receivedDesc" },
  { key: "preparing", icon: "👨‍🍳", labelKey: "tracking.preparing", descKey: "tracking.preparingDesc" },
  { key: "ready", icon: "🔔", labelKey: "tracking.ready", descKey: "tracking.readyDesc" },
  { key: "completed", icon: "✅", labelKey: "tracking.completed", descKey: "tracking.completedDesc" },
];

const CANCELLED = { key: "cancelled", icon: "❌", labelKey: "tracking.cancelled", descKey: "tracking.cancelledDesc" };
const STEP_INDEX = { pending: 0, preparing: 1, ready: 2, completed: 3 };

const PAYMENT_KEYS = {
  pay_at_pickup: "summary.payAtPickup",
  cash: "summary.cash",
  card_terminal: "summary.cardTerminal",
  online: "summary.payment",
};

const STATUS_MESSAGES = {
  preparing: "¡Tu bowl está siendo preparado!",
  ready:     "¡Tu pedido está listo! Pasa a recogerlo.",
  completed: "Pedido entregado. ¡Que lo disfrutes!",
  cancelled: "Tu pedido fue cancelado.",
};

const CANCEL_WINDOW_MS = 5 * 60 * 1000;

const getProteinsText = (order, language) => {
  if (Array.isArray(order.proteins) && order.proteins.length > 0) {
    return order.proteins.map((id) => getItemLabel("protein", id, language)).join(", ");
  }
  return order.protein;
};

const NotifAPI = () => window.Notification;
const notifSupported = () => "Notification" in window;
const notifPermission = () => notifSupported() ? NotifAPI().permission : null;

async function requestNotifPermission() {
  if (!notifSupported()) return false;
  if (notifPermission() === "granted") return true;
  if (notifPermission() === "denied") return false;
  try {
    const result = await NotifAPI().requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

async function fireNotification(title, body, orderId) {
  if (!notifSupported() || notifPermission() !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) {
      reg.showNotification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: `order-${orderId}`,
        data: { url: `/seguimiento/${orderId}` },
      });
    } else {
      new (NotifAPI())(title, { body });
    }
  } catch {
    // Notifications not supported — silently ignore
  }
}

function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={styles.toast} role="alert">
      <span>{message}</span>
      <button className={styles.toastClose} onClick={onClose} aria-label="Cerrar">×</button>
    </div>
  );
}

export default function OrderTracking() {
  const { orderId } = useParams();
  const { token } = useContext(AuthContext);
  const { language, t } = useLanguage();

  const [order, setOrder]               = useState(null);
  const [error, setError]               = useState("");
  const [toast, setToast]               = useState(null);
  const [notifGranted, setNotifGranted] = useState(() => notifPermission() === "granted");
  const [cancelling, setCancelling]     = useState(false);
  const [cancelError, setCancelError]   = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [reviewDismissed, setReviewDismissed] = useState(() =>
    window.localStorage.getItem(`pokePalaceReviewDismissed:${orderId}`) === "1"
  );
  const [reviewOpened, setReviewOpened] = useState(false);

  const prevStatusRef  = useRef(null);
  const notifAskedRef  = useRef(false);

  const fetchOrder = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_URL}/api/orders/${orderId}`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || t("tracking.loadError"));

      const newOrder = data.order;
      setOrder(newOrder);

      if (prevStatusRef.current !== null && prevStatusRef.current !== newOrder.status) {
        const msg = STATUS_MESSAGES[newOrder.status];
        if (msg) setToast(msg);

        if (newOrder.status === "ready") {
          // Play subtle sound
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
          } catch { /* AudioContext not available */ }

          // Fire browser notification (works even when tab is in background)
          fireNotification("¡Tu pedido está listo! 🔔", "Pasa a recoger tu bowl de Poke Palace.", orderId);
        }
      }

      prevStatusRef.current = newOrder.status;

      // Clean up banner tracking when order reaches a terminal state
      if (newOrder.status === "completed" || newOrder.status === "cancelled") {
        clearActiveOrder();
      }
    } catch (e) {
      setError(e.message === "Failed to fetch" ? t("tracking.fetchError") : e.message);
    }
  }, [orderId, t, token]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  // Poll every 3 seconds while order is active
  useEffect(() => {
    if (!order || order.status === "completed" || order.status === "cancelled") return;
    const id = setInterval(fetchOrder, 3000);
    return () => clearInterval(id);
  }, [fetchOrder, order]);

  // Ask for notification permission once when order is active
  useEffect(() => {
    if (!order || notifAskedRef.current) return;
    if (order.status === "completed" || order.status === "cancelled") return;
    if (!notifSupported() || notifPermission() !== "default") return;
    notifAskedRef.current = true;
    // Small delay so page has settled
    setTimeout(async () => {
      const granted = await requestNotifPermission();
      setNotifGranted(granted);
    }, 2000);
  }, [order]);

  const handleCancel = async () => {
    setCancelling(true);
    setCancelError("");
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res  = await fetch(`${API_URL}/api/orders/${orderId}/cancel`, { method: "PATCH", headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || "Error al cancelar");
      setOrder(data.order);
      setToast("Pedido cancelado.");
      setShowCancelConfirm(false);
    } catch (e) {
      setCancelError(e.message);
    } finally {
      setCancelling(false);
    }
  };

  const dismissReview = () => {
    window.localStorage.setItem(`pokePalaceReviewDismissed:${orderId}`, "1");
    setReviewDismissed(true);
  };

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorCard}>
          <p className={styles.errorText}>{error}</p>
          <Link to="/mi-cuenta" className={styles.backLink}>{t("tracking.myOrders")}</Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingCard}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>{t("tracking.loading")}</p>
        </div>
      </div>
    );
  }

  const isCancelled = order.status === "cancelled";
  const currentStep = isCancelled ? -1 : (STEP_INDEX[order.status] ?? 0);
  const isDone      = order.status === "completed";
  const isPending   = order.status === "pending";
  const ageMs       = Date.now() - new Date(order.createdAt).getTime();
  const canCancel   = isPending && ageMs < CANCEL_WINDOW_MS;
  const minsLeft    = canCancel ? Math.ceil((CANCEL_WINDOW_MS - ageMs) / 60000) : 0;

  return (
    <div className={styles.page}>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t("tracking.title")}</h1>
        <p className={styles.pageSubtitle}>
          Pedido #{order._id.slice(-6).toUpperCase()}
          {" · "}
          {new Date(order.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* Notification permission prompt */}
      {notifSupported() && !notifGranted && !isCancelled && !isDone && notifPermission() === "default" && (
        <div style={{
          maxWidth: 480, margin: "0 auto 12px", padding: "11px 14px",
          background: "#f0f7f3", border: "1.5px solid #4A7A5A", borderRadius: 12,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#2d2d2d" }}>¿Activar notificaciones?</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#666" }}>
              Te avisamos cuando tu pedido esté listo, aunque cambies de pestaña.
            </p>
          </div>
          <button
            onClick={async () => { const ok = await requestNotifPermission(); setNotifGranted(ok); }}
            style={{
              background: "#4A7A5A", color: "#fff", border: "none", borderRadius: 8,
              padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Activar
          </button>
        </div>
      )}

      {/* Scheduled pickup notice */}
      {order.isScheduled && order.scheduledPickupTime && (
        <div className={styles.scheduledNotice}>
          <span className={styles.scheduledIcon}>🕐</span>
          <div>
            <p className={styles.scheduledLabel}>Recogida programada</p>
            <p className={styles.scheduledTime}>
              {new Date(order.scheduledPickupTime).toLocaleString("es-MX", {
                weekday: "short", month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      )}

      {/* Estimated time */}
      {(order.status === "pending" || order.status === "preparing") && (
        <div className={styles.estimatedTime}>
          <span>⏱</span>
          <span>Tiempo estimado de preparación: <strong>8–12 min</strong></span>
        </div>
      )}

      {/* Status card */}
      <div className={`${styles.statusCard} ${isDone ? styles.statusDone : ""} ${isCancelled ? styles.statusCancelled : ""}`}>
        {isCancelled ? (
          <div className={styles.cancelledState}>
            <span className={styles.bigIcon}>{CANCELLED.icon}</span>
            <p className={styles.statusLabel}>{t(CANCELLED.labelKey)}</p>
            <p className={styles.statusDesc}>{t(CANCELLED.descKey)}</p>
          </div>
        ) : (
          <div className={styles.activeState}>
            <span className={styles.bigIcon}>{STEP_CONFIG[currentStep].icon}</span>
            <p className={styles.statusLabel}>{t(STEP_CONFIG[currentStep].labelKey)}</p>
            <p className={styles.statusDesc}>{t(STEP_CONFIG[currentStep].descKey)}</p>
            {!isDone && <div className={styles.pulseDot} />}
          </div>
        )}
      </div>

      {/* Stepper */}
      {!isCancelled && (
        <div className={styles.stepperWrap}>
          {STEP_CONFIG.map((step, i) => {
            const done   = i < currentStep;
            const active = i === currentStep;
            return (
              <div key={step.key} className={styles.stepRow}>
                <div className={`${styles.stepDot} ${done ? styles.stepDone : ""} ${active ? styles.stepActive : ""}`}>
                  {done ? "✓" : i + 1}
                </div>
                <div className={styles.stepInfo}>
                  <p className={`${styles.stepLabel} ${active ? styles.stepLabelActive : ""} ${done ? styles.stepLabelDone : ""}`}>
                    {t(step.labelKey)}
                  </p>
                  {active && <p className={styles.stepDesc}>{t(step.descKey)}</p>}
                </div>
                {i < STEP_CONFIG.length - 1 && (
                  <div className={`${styles.stepLine} ${done ? styles.stepLineDone : ""}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {isDone && !reviewDismissed && (
        <section className={styles.reviewCard} aria-labelledby="google-review-title">
          <div className={styles.reviewStars} aria-hidden="true">★★★★★</div>
          <p className={styles.reviewEyebrow}>{t("tracking.reviewEyebrow")}</p>
          <h2 id="google-review-title" className={styles.reviewTitle}>
            {t("tracking.reviewTitle")}
          </h2>
          <p className={styles.reviewBody}>{t("tracking.reviewBody")}</p>
          <div className={styles.reviewActions}>
            <a
              className={styles.reviewPrimaryBtn}
              href={GOOGLE_REVIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setReviewOpened(true)}
            >
              {t("tracking.reviewButton")}
            </a>
            <button
              type="button"
              className={styles.reviewLaterBtn}
              onClick={dismissReview}
            >
              {t("tracking.reviewLater")}
            </button>
          </div>
          {reviewOpened && (
            <p className={styles.reviewThanks} role="status">
              {t("tracking.reviewThanks")}
            </p>
          )}
        </section>
      )}

      {/* Cancel order block — only while pending and within 5-min window */}
      {canCancel && (
        <div style={{
          maxWidth: 480, margin: "0 auto 4px", padding: "12px 16px",
          background: "#fff5f5", border: "1.5px solid #fca5a5", borderRadius: 14,
        }}>
          {!showCancelConfirm ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#7f1d1d" }}>
                Puedes cancelar en los próximos <strong>{minsLeft} min</strong>.
              </p>
              <button
                onClick={() => setShowCancelConfirm(true)}
                style={{
                  background: "transparent", border: "1.5px solid #ef4444", color: "#ef4444",
                  borderRadius: 8, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Cancelar pedido
              </button>
            </div>
          ) : (
            <div>
              <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#7f1d1d" }}>
                ¿Seguro que deseas cancelar?
              </p>
              {order.pointsRedeemed > 0 && (
                <p style={{ margin: "0 0 10px", fontSize: 11, color: "#6b7280" }}>
                  Se reintegrarán {order.pointsRedeemed} puntos a tu cuenta.
                </p>
              )}
              {cancelError && <p style={{ margin: "0 0 8px", fontSize: 12, color: "#dc2626" }}>{cancelError}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  style={{
                    flex: 1, background: "#f3f4f6", border: "none", borderRadius: 8,
                    padding: "8px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  No, mantener
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  style={{
                    flex: 1, background: "#ef4444", color: "#fff", border: "none", borderRadius: 8,
                    padding: "8px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                    opacity: cancelling ? 0.6 : 1,
                  }}
                >
                  {cancelling ? "Cancelando…" : "Sí, cancelar"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Order details */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>{t("tracking.orderData")}</p>
        <div className={styles.detailCard}>
          {order.customer && <DetailRow label={t("summary.name")} value={order.customer} />}
          {order.phone && <DetailRow label={t("summary.phone")} value={order.phone} />}
          {order.fulfillment && (
            <DetailRow label={t("summary.fulfillment")} value={t(`account.delivery.${order.fulfillment}`) || order.fulfillment} />
          )}
          {order.paymentMethod && (
            <DetailRow label={t("summary.payment")} value={t(PAYMENT_KEYS[order.paymentMethod] || "summary.payment")} />
          )}
          {order.notes && <DetailRow label={t("summary.notes")} value={order.notes} />}
        </div>
      </section>

      {order.total != null && (
        <section className={styles.section}>
          <p className={styles.sectionTitle}>Total</p>
          <div className={styles.detailCard}>
            {order.subtotal != null && <DetailRow label="Subtotal" value={`$${order.subtotal.toFixed(2)}`} />}
            {order.promoCode && <DetailRow label="Código promo" value={order.promoCode} />}
            {order.discountAmount > 0 && (
              <DetailRow label="Descuento" value={`-$${order.discountAmount.toFixed(2)}`} />
            )}
            {order.tax != null && <DetailRow label="IVA (16%)" value={`$${order.tax.toFixed(2)}`} />}
            <DetailRow label="Total" value={`$${order.total.toFixed(2)}`} />
          </div>
        </section>
      )}

      <section className={styles.section}>
        <p className={styles.sectionTitle}>{t("tracking.yourBowl")}</p>
        <div className={styles.detailCard}>
          {order.base && <DetailRow label={t("common.base")} value={getItemLabel("base", order.base, language)} />}
          {getProteinsText(order, language) && <DetailRow label={t("common.proteins")} value={getProteinsText(order, language)} />}
          <DetailRow label={t("tracking.size")} value={order.bowlSize === "large" ? t("summary.large") : t("summary.normal")} />
          {order.marinades?.length > 0 && <DetailRow label={t("summary.marinades")} value={order.marinades.map((id) => getItemLabel("marinade", id, language)).join(", ")} />}
          {order.complements?.length > 0 && <DetailRow label={t("common.complements")} value={order.complements.map((id) => getItemLabel("complement", id, language)).join(", ")} />}
          {order.sauces?.length > 0 && <DetailRow label={t("common.sauces")} value={order.sauces.map((id) => getItemLabel("sauce", id, language)).join(", ")} />}
          {order.toppings?.length > 0 && <DetailRow label={t("common.toppings")} value={order.toppings.map((id) => getItemLabel("topping", id, language)).join(", ")} />}
        </div>
      </section>

      <div className={styles.actions}>
        <Link to="/mi-cuenta" className={styles.ghostBtn}>{t("tracking.myOrders")}</Link>
        <Link to="/order" className={styles.primaryBtn}>{t("tracking.orderAgain")}</Link>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value}</span>
    </div>
  );
}
