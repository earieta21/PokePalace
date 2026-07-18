import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import OrderSummary from "../order/OrderSummary";
import { useOrder } from "../order/OrderContext";
import useIdleTimeout from "./useIdleTimeout";
import { API_URL } from "../config";
import {
  clearOrderSubmission,
  getOrCreateOrderSubmission,
  keepOrderSubmissionPayload,
} from "../utils/orderSubmission";

const IDLE_TIMEOUT_MS = 60000;

export default function KioskSummaryPage() {
  const navigate = useNavigate();
  const { order, resetOrder } = useOrder();

  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const goToWelcome = useCallback(() => {
    clearOrderSubmission("kiosk");
    resetOrder();
    navigate("/kiosk", { replace: true });
  }, [resetOrder, navigate]);

  useIdleTimeout(goToWelcome, IDLE_TIMEOUT_MS);

  const onEditStep = (stepIndex) => {
    navigate("/kiosk/order", { state: { initialStep: stepIndex } });
  };

  const onConfirm = async () => {
    const selectedProteins = Array.isArray(order?.proteins) ? order.proteins : [];
    if (!order?.base || selectedProteins.length < 2) {
      setSubmitError("Completa la base y selecciona 2 proteínas para confirmar.");
      return;
    }

    if (!order?.customer?.trim() || !order?.phone?.trim()) {
      setSubmitError("Agrega tu nombre y teléfono para confirmar el pedido.");
      return;
    }

    try {
      setSaving(true);
      setSubmitError("");

      let submission = getOrCreateOrderSubmission("kiosk");
      submission = keepOrderSubmissionPayload(submission, {
        ...order,
        updateCheckout: undefined,
        scheduledPickupTime: order.isScheduled && order.scheduledPickupTime
          ? new Date(order.scheduledPickupTime).toISOString()
          : undefined,
        clientOrderId: submission.clientOrderId,
      });

      const res = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Order-Token": submission.orderToken,
        },
        body: JSON.stringify(submission.payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status < 500 && !data?.retryable) {
          clearOrderSubmission("kiosk", submission.clientOrderId);
        }
        throw new Error(data?.msg || "No se pudo enviar tu pedido. Intenta de nuevo.");
      }

      const shortCode = data.order._id.slice(-6).toUpperCase();
      clearOrderSubmission("kiosk", submission.clientOrderId);
      resetOrder();
      navigate("/kiosk/done", { replace: true, state: { shortCode, total: data.order.total } });
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={goToWelcome}
        style={{
          position: "fixed",
          top: 14,
          right: 14,
          zIndex: 50,
          padding: "9px 16px",
          borderRadius: 999,
          border: "1px solid #ddd",
          background: "#fff",
          color: "#555",
          fontWeight: 700,
          fontSize: 12.5,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        Cancelar pedido
      </button>
      <OrderSummary
        onEditStep={onEditStep}
        onConfirm={onConfirm}
        saving={saving}
        submitError={submitError}
      />
    </div>
  );
}
