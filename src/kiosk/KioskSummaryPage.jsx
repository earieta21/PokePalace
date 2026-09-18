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

  // Cliente identificado por QR desde su celular. Vive SOLO en memoria: el
  // kiosco es una pantalla compartida y el token de su cuenta no debe quedar
  // guardado para el siguiente cliente.
  const [pairing, setPairing] = useState(null);

  const handlePaired = useCallback((data) => {
    setPairing(data);
    if (data.name) order.updateCheckout("customer", data.name);
    if (data.phone) order.updateCheckout("phone", data.phone);
  }, [order]);

  const goToWelcome = useCallback(() => {
    clearOrderSubmission("kiosk");
    setPairing(null);
    resetOrder();
    navigate("/kiosk", { replace: true });
  }, [resetOrder, navigate]);

  useIdleTimeout(goToWelcome, IDLE_TIMEOUT_MS);

  const onBuildBowl = () => {
    navigate("/kiosk/order");
  };

  const onRestart = () => {
    clearOrderSubmission("kiosk");
    setPairing(null);
    resetOrder();
    navigate("/kiosk/menu", { replace: true });
  };

  const onConfirm = async () => {
    if (!Array.isArray(order?.cart) || order.cart.length === 0) {
      setSubmitError("Tu carrito está vacío — agrega al menos un bowl o artículo.");
      return;
    }

    if (!order?.customer?.trim()) {
      setSubmitError("Agrega tu nombre para confirmar el pedido.");
      return;
    }

    if (order?.isScheduled && !order?.scheduledPickupTime) {
      setSubmitError("Elige la fecha y hora para tu pedido programado.");
      return;
    }

    try {
      setSaving(true);
      setSubmitError("");

      let submission = getOrCreateOrderSubmission("kiosk");
      submission = keepOrderSubmissionPayload(submission, {
        cart: order.cart,
        customer: order.customer,
        phone: order.phone,
        fromKiosk: true,
        notes: order.notes,
        fulfillment: order.fulfillment,
        paymentMethod: order.paymentMethod,
        promoCode: order.promoCode,
        isScheduled: order.isScheduled,
        scheduledPickupTime: order.isScheduled && order.scheduledPickupTime
          ? new Date(order.scheduledPickupTime).toISOString()
          : undefined,
        clientOrderId: submission.clientOrderId,
      });

      // Con cuenta ligada el pedido va autenticado (así se le acreditan los
      // puntos); sin ella, sigue el camino de invitado con su token.
      const headers = { "Content-Type": "application/json" };
      if (pairing?.orderToken) {
        headers.Authorization = `Bearer ${pairing.orderToken}`;
      } else {
        headers["X-Order-Token"] = submission.orderToken;
      }

      const res = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers,
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
      navigate("/kiosk/done", {
        replace: true,
        state: {
          shortCode,
          total: data.order.total,
          orderId: data.order._id,
          orderToken: submission.orderToken,
        },
      });
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
        onBuildBowl={onBuildBowl}
        onBrowseMenu={() => navigate("/kiosk/menu")}
        onRestart={onRestart}
        onConfirm={onConfirm}
        saving={saving}
        submitError={submitError}
        isKiosk
        pairing={pairing}
        onPaired={handlePaired}
      />
    </div>
  );
}
