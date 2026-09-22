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
import styles from "./OrderPage.module.css";

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

/* Barra de progreso: antes eran 6 círculos numerados; ahora una línea que
   se llena con el nombre del paso encima — se lee de un vistazo y aguanta
   mejor en pantallas angostas. */
function StepProgress({ step, t }) {
  const currentStepName = t(STEP_NAME_KEYS[step]);
  const pct = ((step + 1) / TOTAL_STEPS) * 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={TOTAL_STEPS}
      aria-valuenow={step + 1}
      aria-label={t("order.progressLabel", { step: step + 1, total: TOTAL_STEPS, name: currentStepName })}
    >
      <div className={styles.progressRow}>
        <span className={styles.stepLabel}>{currentStepName}</span>
        <span className={styles.stepCount}>
          {step + 1} / {TOTAL_STEPS}
        </span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PausedBanner({ message, t }) {
  return (
    <div className={styles.paused}>
      <span aria-hidden="true" className={styles.pausedIcon}>⏸</span>
      <div>
        <p className={styles.pausedTitle}>{t("order.pausedTitle")}</p>
        <p className={styles.pausedText}>{message || t("order.pausedFallback")}</p>
      </div>
    </div>
  );
}

function priceLabel(order, t) {
  if (order.promo2x1) {
    const stageLabel = order.promo2x1.stage === 1 ? "Bowl 1 de 2" : "Bowl 2 de 2";
    return `${stageLabel} · $${PROMO_2X1_BOWLS_PRICE} MXN por los 2`;
  }
  const isLarge = Array.isArray(order.proteins) && order.proteins.length >= 3;
  const price = isLarge ? BOWL_BASE_PRICE + LARGE_BOWL_UPCHARGE : BOWL_BASE_PRICE;
  return `$${price} MXN${isLarge ? ` · ${t("order.largeBowlSuffix")}` : ""}`;
}

function bowlSummaryParts({ order, step, language, t }) {
  if (step === 0) return [];

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

  return parts;
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

  const summaryParts = bowlSummaryParts({ order, step, language, t });

  return (
    <div>
      <div className={styles.head}>
        {storeStatus?.ordersPaused && <PausedBanner message={storeStatus.pausedMessage} t={t} />}
        <StepProgress step={step} t={t} />
        <div className={styles.metaRow}>
          <div className={styles.summary}>
            {summaryParts.map((p, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span aria-hidden="true" className={styles.summarySep}>›</span>}
                <span className={styles.summaryItem}>
                  <span aria-hidden="true">{p.icon}</span>
                  <span>{p.text}</span>
                </span>
              </React.Fragment>
            ))}
          </div>
          <span className={styles.price}>{priceLabel(order, t)}</span>
        </div>
      </div>
      {steps[step]}
    </div>
  );
};

export default OrderPage;
