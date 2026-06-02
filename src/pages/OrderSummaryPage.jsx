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
    if (!order?.base || !order?.protein) {
      setSubmitError("Completa al menos base y proteína antes de confirmar.");
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
        body: JSON.stringify(order),
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
