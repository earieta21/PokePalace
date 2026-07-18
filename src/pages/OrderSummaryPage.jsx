import React, { useContext, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import OrderSummary from "../order/OrderSummary";
import { AuthContext } from "../context/AuthContext";
import { useOrder } from "../order/OrderContext";
import { API_URL } from "../config";
import { useLanguage } from "../i18n/LanguageContext";
import { saveActiveOrder } from "../utils/orderAccess";
import { computePricing } from "../order/pricing";
import {
  clearOrderSubmission,
  getOrCreateOrderSubmission,
  keepOrderSubmissionPayload,
} from "../utils/orderSubmission";

const POINTS_PER_REWARD = 100;
const REWARD_VALUE_MXN  = 25;

export default function OrderSummaryPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const { isLoggedIn, token, user, refreshUser } = useContext(AuthContext);
  const { order, resetOrder } = useOrder();
  const { t } = useLanguage();

  // Cliente logueado: rellena nombre/teléfono desde su cuenta si el borrador
  // llegó vacío — ya no debería tener que volver a escribirlos cada vez.
  useEffect(() => {
    if (!isLoggedIn || !user) return;
    if (!order.customer?.trim() && user.name) order.updateCheckout("customer", user.name);
    if (!order.phone?.trim() && user.phone) order.updateCheckout("phone", user.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, user]);

  const isGuest = Boolean(location.state?.guest);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [waitMinutes, setWaitMinutes] = useState(null);

  // Points redemption state
  const [usePoints, setUsePoints] = useState(false);
  const [validatedPromo, setValidatedPromo] = useState(null);
  const userPoints     = user?.points ?? 0;
  const derivedBowlSize = order?.proteins?.length === 3 ? "large" : "normal";
  const orderTotalAfterPromo = computePricing(derivedBowlSize, validatedPromo).total;
  const redeemableBlocks = Math.min(
    Math.floor(userPoints / POINTS_PER_REWARD),
    Math.floor(orderTotalAfterPromo / REWARD_VALUE_MXN)
  );
  const pointsDiscount   = redeemableBlocks * REWARD_VALUE_MXN;
  const pointsToRedeem   = redeemableBlocks * POINTS_PER_REWARD;

  // Refresh points when page mounts so balance is current
  // refreshUser is recreated by AuthProvider; depending on it would refetch on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isLoggedIn) refreshUser?.(); }, [isLoggedIn]);

  // Keep the points offer below the server-authoritative total after promo.
  // The promo component writes its code into the shared order draft.
  useEffect(() => {
    const code = order?.promoCode?.trim();
    if (!code) {
      setValidatedPromo(null);
      return undefined;
    }
    if (validatedPromo?.code === code.toUpperCase()) return undefined;
    setValidatedPromo(null);

    const controller = new AbortController();
    fetch(`${API_URL}/api/promo-codes/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((promo) => {
        if (promo?.code === code.toUpperCase()) setValidatedPromo(promo);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setValidatedPromo(null);
      });

    return () => controller.abort();
  }, [order?.promoCode, validatedPromo]);

  useEffect(() => {
    if (redeemableBlocks < 1) setUsePoints(false);
  }, [redeemableBlocks]);

  // Fetch current wait time estimate
  useEffect(() => {
    fetch(`${API_URL}/api/orders/wait-time`)
      .then((r) => r.json())
      .then((d) => setWaitMinutes(d.waitMinutes ?? null))
      .catch(() => {});
  }, []);

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

      const actor = isLoggedIn
        ? `user:${user?._id || user?.id || "authenticated"}`
        : "guest";
      let submission = getOrCreateOrderSubmission(actor);
      if (!isLoggedIn) headers["X-Order-Token"] = submission.orderToken;

      // Freeze the first submitted payload alongside its idempotency key. If
      // the network response is lost and the page reloads, the retry sends the
      // exact same order instead of accidentally reusing its reservations for
      // an edited draft.
      submission = keepOrderSubmissionPayload(submission, {
        ...order,
        updateCheckout: undefined,
        scheduledPickupTime: order.isScheduled && order.scheduledPickupTime
          ? new Date(order.scheduledPickupTime).toISOString()
          : undefined,
        pointsToRedeem: usePoints && isLoggedIn ? pointsToRedeem : 0,
        clientOrderId: submission.clientOrderId,
      });

      const res = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify(submission.payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Validation failures happen before a reservation is made and may be
        // corrected with a fresh attempt. Server/network ambiguity preserves
        // this id + payload so the next click resumes exactly once.
        if (res.status < 500 && !data?.retryable) {
          clearOrderSubmission(actor, submission.clientOrderId);
        }
        throw new Error(data?.msg || t("summary.saveError"));
      }

      saveActiveOrder(
        data.order._id,
        data.orderToken || (!isLoggedIn ? submission.orderToken : null)
      );
      clearOrderSubmission(actor, submission.clientOrderId);
      resetOrder();
      refreshUser?.(); // update points balance after redemption

      if (data.order.paymentMethod === "online" && data.paymentUrl) {
        window.location.href = data.paymentUrl; // Redirige al checkout hospedado por Clip
        return;
      }

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
          <button
            type="button"
            onClick={() => setUsePoints((v) => !v)}
            aria-pressed={usePoints}
            style={{
              display: "flex", alignItems: "center", gap: 14, cursor: "pointer", width: "100%",
              padding: "14px 16px", marginTop: 16, marginBottom: -8, borderRadius: 14,
              border: `2px solid ${usePoints ? "#4A7A5A" : "#e0dbd1"}`,
              background: usePoints ? "#f0f7f3" : "#fafaf8",
              transition: "border-color 200ms, background 200ms",
              userSelect: "none", textAlign: "left", fontFamily: "inherit",
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              background: usePoints ? "#4A7A5A" : "#e0dbd1",
              transition: "background 200ms",
            }}>
              {usePoints && <span aria-hidden="true" style={{ color: "#fff", fontSize: 14, fontWeight: 800, lineHeight: 1 }}>✓</span>}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#2d2d2d" }}>
                {t("summary.usePoints")}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#777" }}>
                {t("summary.pointsBalance", { points: userPoints })} → <strong style={{ color: "#4A7A5A" }}>
                  {t("summary.pointsDiscount", { amount: pointsDiscount })}
                </strong> {t("summary.onThisOrder")}
              </p>
            </div>
          </button>
        </div>
      )}

      {/* Wait time estimate */}
      {waitMinutes !== null && (
        <div style={{ maxWidth: 560, margin: "16px auto 0", padding: "0 16px" }}>
          <div role="status" aria-live="polite" style={{
            display: "flex", alignItems: "center", gap: 10,
            background: waitMinutes <= 12 ? "#f0fdf4" : waitMinutes <= 20 ? "#fffbeb" : "#fef3c7",
            border: `1px solid ${waitMinutes <= 12 ? "#bbf7d0" : waitMinutes <= 20 ? "#fde68a" : "#fcd34d"}`,
            borderRadius: 12, padding: "12px 16px",
          }}>
            <span aria-hidden="true" style={{ fontSize: 20 }}>⏱</span>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>
                {t("summary.estimatedTime")}: <strong style={{ color: waitMinutes <= 12 ? "#166534" : "#92400e" }}>~{waitMinutes} min</strong>
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#666" }}>
                {waitMinutes <= 12 ? t("summary.waitLow") : waitMinutes <= 20 ? t("summary.waitNormal") : t("summary.waitBusy")}
              </p>
            </div>
          </div>
        </div>
      )}

      <OrderSummary
        onEditStep={onEditStep}
        onConfirm={onConfirm}
        onPromoChange={setValidatedPromo}
        pointsDiscount={usePoints ? pointsDiscount : 0}
        saving={saving}
        submitError={submitError}
        showOnlinePayment
      />
    </>
  );
}
