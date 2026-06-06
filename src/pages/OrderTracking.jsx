import { useCallback, useEffect, useState, useContext } from "react";
import { useParams, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../config";
import { PROTEIN_LABELS } from "../order/OrderLabels";
import styles from "./OrderTracking.module.css";

const STEPS = [
  { key: "pending",    icon: "📋", label: "Recibido",        desc: "Tu pedido fue recibido" },
  { key: "preparing",  icon: "👨‍🍳", label: "En preparación",  desc: "Estamos preparando tu bowl" },
  { key: "ready",      icon: "🔔", label: "Listo",            desc: "¡Tu pedido está listo!" },
  { key: "completed",  icon: "✅", label: "Entregado",        desc: "¡Buen provecho!" },
];

const CANCELLED = { key: "cancelled", icon: "❌", label: "Cancelado", desc: "Tu pedido fue cancelado" };

const STEP_INDEX = { pending: 0, preparing: 1, ready: 2, completed: 3 };

const FULFILLMENT_LABEL = {
  pickup: "Recoger en restaurante",
  dine_in: "Comer en restaurante",
  delivery: "Delivery",
};

const PAYMENT_LABEL = {
  pay_at_pickup: "Pagar al recoger",
  cash: "Efectivo",
  card_terminal: "Tarjeta en terminal",
  online: "Pago en línea",
};

const getProteinsText = (order) => {
  if (Array.isArray(order.proteins) && order.proteins.length > 0) {
    return order.proteins.map((id) => PROTEIN_LABELS[id] ?? id).join(", ");
  }
  return order.protein;
};

export default function OrderTracking() {
  const { orderId } = useParams();
  const { token } = useContext(AuthContext);

  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");

  const fetchOrder = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_URL}/api/orders/${orderId}`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || "No se pudo obtener la orden");
      setOrder(data.order);
    } catch (e) {
      setError(
        e.message === "Failed to fetch"
          ? "No se pudo conectar con el servidor de órdenes. Revisa que el backend esté encendido."
          : e.message
      );
    }
  }, [orderId, token]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Poll every 6 seconds while order is active
  useEffect(() => {
    if (!order || order.status === "completed" || order.status === "cancelled") return;
    const id = setInterval(fetchOrder, 6000);
    return () => clearInterval(id);
  }, [fetchOrder, order]);

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorCard}>
          <p className={styles.errorText}>{error}</p>
          <Link to="/mi-cuenta" className={styles.backLink}>Ver mis pedidos</Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingCard}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>Cargando tu pedido...</p>
        </div>
      </div>
    );
  }

  const isCancelled = order.status === "cancelled";
  const currentStep = isCancelled ? -1 : (STEP_INDEX[order.status] ?? 0);
  const isDone = order.status === "completed";

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Seguimiento de orden</h1>
        <p className={styles.pageSubtitle}>
          Pedido #{order._id.slice(-6).toUpperCase()}
          {" · "}
          {new Date(order.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* Status card */}
      <div className={`${styles.statusCard} ${isDone ? styles.statusDone : ""} ${isCancelled ? styles.statusCancelled : ""}`}>
        {isCancelled ? (
          <div className={styles.cancelledState}>
            <span className={styles.bigIcon}>{CANCELLED.icon}</span>
            <p className={styles.statusLabel}>{CANCELLED.label}</p>
            <p className={styles.statusDesc}>{CANCELLED.desc}</p>
          </div>
        ) : (
          <div className={styles.activeState}>
            <span className={styles.bigIcon}>{STEPS[currentStep].icon}</span>
            <p className={styles.statusLabel}>{STEPS[currentStep].label}</p>
            <p className={styles.statusDesc}>{STEPS[currentStep].desc}</p>
            {!isDone && <div className={styles.pulseDot} />}
          </div>
        )}
      </div>

      {/* Stepper */}
      {!isCancelled && (
        <div className={styles.stepperWrap}>
          {STEPS.map((step, i) => {
            const done = i < currentStep;
            const active = i === currentStep;
            return (
              <div key={step.key} className={styles.stepRow}>
                <div className={`${styles.stepDot} ${done ? styles.stepDone : ""} ${active ? styles.stepActive : ""}`}>
                  {done ? "✓" : i + 1}
                </div>
                <div className={styles.stepInfo}>
                  <p className={`${styles.stepLabel} ${active ? styles.stepLabelActive : ""} ${done ? styles.stepLabelDone : ""}`}>
                    {step.label}
                  </p>
                  {active && <p className={styles.stepDesc}>{step.desc}</p>}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`${styles.stepLine} ${done ? styles.stepLineDone : ""}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Order details */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>Datos del pedido</p>
        <div className={styles.detailCard}>
          {order.customer && <DetailRow label="Nombre" value={order.customer} />}
          {order.phone && <DetailRow label="Teléfono" value={order.phone} />}
          {order.fulfillment && (
            <DetailRow label="Entrega" value={FULFILLMENT_LABEL[order.fulfillment] ?? order.fulfillment} />
          )}
          {order.paymentMethod && (
            <DetailRow label="Pago" value={PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod} />
          )}
          {order.notes && <DetailRow label="Notas" value={order.notes} />}
        </div>
      </section>

      <section className={styles.section}>
        <p className={styles.sectionTitle}>Tu bowl</p>
        <div className={styles.detailCard}>
          {order.base && <DetailRow label="Base" value={order.base} />}
          {getProteinsText(order) && <DetailRow label="Proteínas" value={getProteinsText(order)} />}
          <DetailRow label="Tamaño" value={order.bowlSize === "large" ? "Bowl grande" : "Bowl normal"} />
          {order.marinades?.length > 0 && <DetailRow label="Marinados" value={order.marinades.join(", ")} />}
          {order.complements?.length > 0 && <DetailRow label="Complementos" value={order.complements.join(", ")} />}
          {order.sauces?.length > 0 && <DetailRow label="Salsas" value={order.sauces.join(", ")} />}
          {order.toppings?.length > 0 && <DetailRow label="Toppings" value={order.toppings.join(", ")} />}
        </div>
      </section>

      <div className={styles.actions}>
        <Link to="/mi-cuenta" className={styles.ghostBtn}>Ver mis pedidos</Link>
        <Link to="/order" className={styles.primaryBtn}>Ordenar de nuevo</Link>
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
