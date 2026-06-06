import React, { useContext, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import OrderSummary from "../order/OrderSummary";
import { AuthContext } from "../context/AuthContext";
import { useOrder } from "../order/OrderContext";
import { API_URL } from "../config";

export default function OrderSummaryPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const { isLoggedIn, token } = useContext(AuthContext);
  const { order } = useOrder();

  const isGuest = Boolean(location.state?.guest);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const onEditStep = (stepIndex) => {
    navigate(`/order?step=${stepIndex}&edit=1`, { state: { guest: isGuest } });
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

      const headers = {
        "Content-Type": "application/json",
      };

      if (isLoggedIn && token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...order,
          updateCheckout: undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || "Could not save your order. Please try again.");

      navigate(`/seguimiento/${data.order._id}`, { replace: true });
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <OrderSummary
      onEditStep={onEditStep}
      onConfirm={onConfirm}
      saving={saving}
      submitError={submitError}
    />
  );
}
