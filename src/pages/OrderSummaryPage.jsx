import React, { useContext, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import OrderSummary from "../order/OrderSummary";
import { AuthContext } from "../context/AuthContext";
import { useOrder } from "../order/OrderContext";
import { API_URL } from "../config";
import { useLanguage } from "../i18n/LanguageContext";

const POINTS_PER_REWARD = 100;
const REWARD_VALUE_MXN  = 25;

export default function OrderSummaryPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const { isLoggedIn, token, user, refreshUser } = useContext(AuthContext);
  const { order, resetOrder } = useOrder();
  const { t } = useLanguage();

  const isGuest = Boolean(location.state?.guest);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Points redemption state
  const [usePoints, setUsePoints] = useState(false);
  const userPoints     = user?.points ?? 0;
  const redeemableBlocks = Math.floor(userPoints / POINTS_PER_REWARD);
  const pointsDiscount   = redeemableBlocks * REWARD_VALUE_MXN;
  const pointsToRedeem   = redeemableBlocks * POINTS_PER_REWARD;

  // Refresh points when page mounts so balance is current
  useEffect(() => { if (isLoggedIn) refreshUser?.(); }, [isLoggedIn]);

  const onEditStep = (stepIndex) => {
    navigate(`/order?step=${stepIndex}&edit=1`, { state: { guest: isGuest } });
  };

  const onConfirm = async () => {
    const selectedProteins = Array.isArray(order?.proteins) ? order.proteins : [];
    if (!order?.base || selectedProteins.length < 1) {
      setSubmitError(t("summary.missingBowl"));
      return;
    }

    if (!order?.customer?.trim() || !order?.phone?.trim()) {
      setSubmitError(t("summary.missingContact"));
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
          scheduledPickupTime: order.isScheduled && order.scheduledPickupTime
            ? new Date(order.scheduledPickupTime).toISOString()
            : undefined,
          pointsToRedeem: usePoints && isLoggedIn ? pointsToRedeem : 0,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || t("summary.saveError"));

      resetOrder();
      refreshUser?.(); // update points balance after redemption
      navigate(`/seguimiento/${data.order._id}`, { replace: true });
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Points redemption banner — only for logged-in users with enough points */}
      {isLoggedIn && redeemableBlocks >= 1 && (
        <div style={{
          maxWidth: 560, margin: "0 auto", padding: "0 16px",
        }}>
          <div
            onClick={() => setUsePoints((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
              padding: "14px 16px", marginTop: 16, marginBottom: -8, borderRadius: 14,
              border: `2px solid ${usePoints ? "#4A7A5A" : "#e0dbd1"}`,
              background: usePoints ? "#f0f7f3" : "#fafaf8",
              transition: "border-color 200ms, background 200ms",
              userSelect: "none",
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              background: usePoints ? "#4A7A5A" : "#e0dbd1",
              transition: "background 200ms",
            }}>
              {usePoints && <span style={{ color: "#fff", fontSize: 14, fontWeight: 800, lineHeight: 1 }}>✓</span>}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#2d2d2d" }}>
                Usar mis puntos de lealtad
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#777" }}>
                {userPoints} puntos → <strong style={{ color: "#4A7A5A" }}>
                  ${pointsDiscount} MXN de descuento
                </strong> en esta orden
              </p>
            </div>
          </div>
        </div>
      )}

      <OrderSummary
        onEditStep={onEditStep}
        onConfirm={onConfirm}
        saving={saving}
        submitError={submitError}
      />
    </>
  );
}
