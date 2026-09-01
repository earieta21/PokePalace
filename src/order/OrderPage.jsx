import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import BaseSelection from "./BaseSelection";
import ProteinSelection from "./ProteinSelection";
import MarinadeSelection from "./MarinadeSelection";
import ComplementsSelection from "./ComplementsSelection";
import SauceSelection from "./SauceSelection";
import ToppingsSelection from "./ToppingsSelection";
import { useOrder } from "./OrderContext";
import { ITEM_LABELS, getBaseLabel } from "./OrderLabels";
import { BOWL_BASE_PRICE, LARGE_BOWL_UPCHARGE, PROMO_2X1_BOWLS_PRICE } from "./pricing";
import { API_URL } from "../config";
import { useLanguage } from "../i18n/LanguageContext";

const TOTAL_STEPS = 6;
const LAST_STEP = TOTAL_STEPS - 1;
const STEP_NAME_KEYS = [
  "summary.base",
  "summary.protein",
  "summary.marinades",
  "summary.complements",
  "summary.sauces",
  "summary.toppings",
];

function StepProgress({ step, t }) {
  const currentStepName = t(STEP_NAME_KEYS[step]);
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={TOTAL_STEPS}
      aria-valuenow={step + 1}
      aria-label={t("order.progressLabel", { step: step + 1, total: TOTAL_STEPS, name: currentStepName })}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "14px 20px 4px",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <React.Fragment key={i}>
          <div
            title={t(STEP_NAME_KEYS[i])}
            aria-hidden="true"
            style={{
              width: 28, height: 28,
              borderRadius: "50%",
              flexShrink: 0,
              background: i <= step ? "var(--accent)" : "transparent",
              border: `2px solid ${i <= step ? "var(--accent)" : "#d1d5db"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: i <= step ? "#fff" : "#9ca3af",
              fontSize: "11.5px", fontWeight: 700,
              transition: "all 200ms ease",
            }}
          >
            {i < step ? "✓" : i + 1}
          </div>
          {i < TOTAL_STEPS - 1 && (
            <div style={{
              flex: 1, height: 2,
              background: i < step ? "var(--accent)" : "#e5e7eb",
              transition: "background 200ms ease",
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function PausedBanner({ message, t }) {
  return (
    <div style={{
      maxWidth: 960, margin: "0 auto", padding: "0 20px 4px",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "#fef2f2", border: "1px solid #fecaca",
        borderRadius: 12, padding: "12px 16px", marginTop: 10,
      }}>
        <span aria-hidden="true" style={{ fontSize: 20 }}>⏸</span>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: "#991b1b" }}>
            {t("order.pausedTitle")}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#b91c1c" }}>
            {message || t("order.pausedFallback")}
          </p>
        </div>
      </div>
    </div>
  );
}

function PriceChip({ order, t }) {
  if (order.promo2x1) {
    const stageLabel = order.promo2x1.stage === 1 ? "Bowl 1 de 2" : "Bowl 2 de 2";
    return (
      <div style={{
        display: "flex",
        justifyContent: "flex-end",
        padding: "2px 20px 4px",
        maxWidth: 960,
        margin: "0 auto",
      }}>
        <span style={{
          background: "var(--accent-bg)",
          border: "1px solid var(--accent-border)",
          color: "var(--accent)",
          borderRadius: 999,
          padding: "4px 12px",
          fontSize: 13,
          fontWeight: 700,
        }}>
          {stageLabel} · ${PROMO_2X1_BOWLS_PRICE} MXN por los 2 🎉
        </span>
      </div>
    );
  }

  const isLarge = Array.isArray(order.proteins) && order.proteins.length >= 3;
  const price = isLarge ? BOWL_BASE_PRICE + LARGE_BOWL_UPCHARGE : BOWL_BASE_PRICE;
  return (
    <div style={{
      display: "flex",
      justifyContent: "flex-end",
      padding: "2px 20px 4px",
      maxWidth: 960,
      margin: "0 auto",
    }}>
      <span style={{
        background: "var(--accent-bg)",
        border: "1px solid var(--accent-border)",
        color: "var(--accent)",
        borderRadius: 999,
        padding: "4px 12px",
        fontSize: 13,
        fontWeight: 700,
      }}>
        ${price} MXN{isLarge ? ` · ${t("order.largeBowlSuffix")}` : ""}
      </span>
    </div>
  );
}

function BowlMiniSummary({ order, step, language, t }) {
  if (step === 0) return null;

  const parts = [];
  const labels = ITEM_LABELS[language] || ITEM_LABELS.es;
  const countLabel = (count, oneKey, manyKey) => t(count === 1 ? oneKey : manyKey, { count });

  if (order.base) {
    parts.push({ icon: "🍚", text: getBaseLabel(order.bases, order.base, language) });
  }
  if (Array.isArray(order.proteins) && order.proteins.length > 0) {
    const names = order.proteins.map((id) => labels.protein[id] || id);
    parts.push({ icon: "🐟", text: names.join(", ") });
  }
  if (step >= 2 && Array.isArray(order.marinades) && order.marinades.length > 0) {
    parts.push({
      icon: "🧉",
      text: countLabel(order.marinades.length, "order.marinadeCountOne", "order.marinadeCountMany"),
    });
  }
  if (step >= 3 && Array.isArray(order.complements) && order.complements.length > 0) {
    parts.push({
      icon: "🥗",
      text: countLabel(order.complements.length, "order.complementCountOne", "order.complementCountMany"),
    });
  }
  if (step >= 4 && Array.isArray(order.sauces) && order.sauces.length > 0) {
    parts.push({
      icon: "🥣",
      text: countLabel(order.sauces.length, "order.sauceCountOne", "order.sauceCountMany"),
    });
  }

  if (parts.length === 0) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 4,
      padding: "4px 20px 6px",
      overflowX: "auto",
      scrollbarWidth: "none",
      msOverflowStyle: "none",
      maxWidth: 960,
      margin: "0 auto",
    }}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: "#d1d5db", fontSize: "10px", flexShrink: 0 }}>›</span>}
          <span style={{
            fontSize: "11.5px", fontWeight: 500, color: "var(--text-2)",
            whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3,
          }}>
            <span aria-hidden="true">{p.icon}</span>
            <span>{p.text}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

const OrderPage = () => {
  const { order, updateOrder, addBowlToCart, confirmPromoBowl, cancelPromo2x1 } = useOrder();
  const { language, t } = useLanguage();
  const [step, setStep] = useState(() => {
    const savedStep = Number(order.draftStep);
    return Number.isInteger(savedStep) && savedStep >= 0 && savedStep <= LAST_STEP ? savedStep : 0;
  });
  const navigate = useNavigate();

  const [storeStatus, setStoreStatus] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/api/settings/store-status`)
      .then((r) => r.json())
      .then(setStoreStatus)
      .catch(() => {});
  }, []);

  const setOrderStep = useCallback((nextStep) => {
    setStep(nextStep);
    updateOrder("draftStep", nextStep);
  }, [updateOrder]);

  // En el stage 2 de la promo 2x1 la proteína ya quedó fija con el primer
  // bowl (compartida entre los 2) — se salta el paso 1 (proteína) para no
  // dejar que el cliente la cambie ahí y termine confundido cuando el
  // resultado final igual use la proteína original.
  const isPromo2x1Stage2 = order.promo2x1?.stage === 2;

  const nextStep = () => {
    let next = Math.min(step + 1, LAST_STEP);
    if (isPromo2x1Stage2 && next === 1) next = 2;
    setOrderStep(next);
  };

  const prevStep = () => {
    if (step === 0) {
      // Salir del armador a medio armar la promo 2x1 la cancela — si no, el
      // cliente quedaría atorado con una proteína fija sin poder editarla.
      if (order.promo2x1) cancelPromo2x1();
      navigate(-1);
      return;
    }
    let prev = Math.max(step - 1, 0);
    if (isPromo2x1Stage2 && prev === 1) prev = 0;
    setOrderStep(prev);
  };

  // Confirma el bowl en construcción como línea del carrito (nueva, o
  // reemplazando la que se estaba editando) y regresa al menú para que el
  // cliente decida si agrega otro bowl/artículo o va al carrito. Dentro de
  // la promo 2x1, el primer bowl reinicia el armador para el segundo en vez
  // de salir al menú.
  const finishBowl = () => {
    if (order.promo2x1) {
      const isFirstBowl = order.promo2x1.stage === 1;
      confirmPromoBowl();
      if (isFirstBowl) {
        setOrderStep(0);
      } else {
        navigate("/menu");
      }
      return;
    }
    addBowlToCart();
    navigate("/menu");
  };

  const steps = [
    <BaseSelection key="base" onNext={nextStep} onBack={prevStep} />,
    <ProteinSelection key="protein" onNext={nextStep} onBack={prevStep} />,
    <MarinadeSelection key="marinade" onNext={nextStep} onBack={prevStep} />,
    <ComplementsSelection key="complements" onNext={nextStep} onBack={prevStep} />,
    <SauceSelection key="sauce" onNext={nextStep} onBack={prevStep} />,
    <ToppingsSelection key="toppings" onNext={finishBowl} onBack={prevStep} />,
  ];

  return (
    <div>
      {storeStatus?.ordersPaused && <PausedBanner message={storeStatus.pausedMessage} t={t} />}
      <StepProgress step={step} t={t} />
      <PriceChip order={order} t={t} />
      <BowlMiniSummary order={order} step={step} language={language} t={t} />
      {steps[step]}
    </div>
  );
};

export default OrderPage;
