import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useOrder } from "../order/OrderContext";
import { useLanguage } from "../i18n/LanguageContext";
import { PROMO_2X1_BOWLS_PRICE } from "../order/pricing";
import { bowlDraftPrice, bowlSummaryParts } from "../order/bowlDraftSummary";
import useIdleTimeout from "./useIdleTimeout";
import styles from "./KioskOrderPage.module.css";

import BaseSelection from "../order/BaseSelection";
import ProteinSelection from "../order/ProteinSelection";
import MarinadeSelection from "../order/MarinadeSelection";
import ComplementsSelection from "../order/ComplementsSelection";
import SauceSelection from "../order/SauceSelection";
import ToppingsSelection from "../order/ToppingsSelection";

const IDLE_TIMEOUT_MS = 60000;
const TOTAL_STEPS = 6;
const LAST_STEP = TOTAL_STEPS - 1;
// Mismas claves que usa el armador de la web, para que el kiosco nombre los
// pasos exactamente igual.
const STEP_NAME_KEYS = [
  "summary.base",
  "summary.protein",
  "summary.marinades",
  "summary.complements",
  "summary.sauces",
  "summary.toppings",
];

export default function KioskOrderPage() {
  const { order, updateOrder, resetOrder, addBowlToCart, confirmPromoBowl } = useOrder();
  const { language, t } = useLanguage();
  const [step, setStep] = useState(() => {
    const savedStep = Number(order.draftStep);
    return Number.isInteger(savedStep) && savedStep >= 0 && savedStep <= LAST_STEP ? savedStep : 0;
  });
  const navigate = useNavigate();

  const goToWelcome = useCallback(() => {
    resetOrder();
    navigate("/kiosk", { replace: true });
  }, [resetOrder, navigate]);

  useIdleTimeout(goToWelcome, IDLE_TIMEOUT_MS);

  // En el stage 2 de la promo 2x1 la proteína ya quedó fija con el primer
  // bowl (compartida) — se salta el paso 1 (proteína), igual que en
  // OrderPage.jsx (la versión web del armador).
  const isPromo2x1Stage2 = order.promo2x1?.stage === 2;

  const setOrderStep = (nextStep) => {
    setStep(nextStep);
    updateOrder("draftStep", nextStep);
  };
  const nextStep = () => {
    let next = Math.min(step + 1, LAST_STEP);
    if (isPromo2x1Stage2 && next === 1) next = 2;
    setOrderStep(next);
  };
  const prevStep = () => {
    let prev = Math.max(0, step - 1);
    if (isPromo2x1Stage2 && prev === 1) prev = 0;
    setOrderStep(prev);
  };

  // Confirma el bowl en construcción como línea del carrito y regresa al
  // menú para que el cliente decida si agrega otro bowl/artículo o va al
  // carrito — igual que en la app web. Dentro de la promo 2x1, el primer
  // bowl reinicia el armador para el segundo en vez de salir al menú.
  const finishBowl = () => {
    if (order.promo2x1) {
      const isFirstBowl = order.promo2x1.stage === 1;
      confirmPromoBowl();
      if (isFirstBowl) {
        setOrderStep(0);
      } else {
        navigate("/kiosk/menu");
      }
      return;
    }
    addBowlToCart();
    navigate("/kiosk/menu");
  };

  const steps = [
    <BaseSelection key="base" onNext={nextStep} onBack={prevStep} isKiosk />,
    <ProteinSelection key="protein" onNext={nextStep} onBack={prevStep} isKiosk />,
    <MarinadeSelection key="marinade" onNext={nextStep} onBack={prevStep} isKiosk />,
    <ComplementsSelection key="complements" onNext={nextStep} onBack={prevStep} isKiosk />,
    <SauceSelection key="sauce" onNext={nextStep} onBack={prevStep} isKiosk />,
    <ToppingsSelection key="toppings" onNext={finishBowl} onBack={prevStep} isKiosk />,
  ];

  const summaryParts = bowlSummaryParts(order, language);
  const price = bowlDraftPrice(order);
  const pct = ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <span className={styles.wordmark}>
          POKE <span>PALACE</span>
        </span>

        {order.promo2x1 ? (
          <span className={styles.promoPill}>
            🎉 {order.promo2x1.stage === 1 ? "Bowl 1 de 2" : "Bowl 2 de 2"} · 2x1 en Bowls
            {" · "}${PROMO_2X1_BOWLS_PRICE} MXN por los 2
          </span>
        ) : (
          <span className={styles.spacer} />
        )}

        <button type="button" className={styles.cancelBtn} onClick={goToWelcome}>
          Cancelar pedido
        </button>
      </div>

      <div className={styles.progress}>
        <div className={styles.progressRow}>
          <span className={styles.stepLabel}>{t(STEP_NAME_KEYS[step])}</span>
          <span className={styles.stepCount}>
            {step + 1} / {TOTAL_STEPS}
          </span>
        </div>
        <div
          className={styles.track}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={step + 1}
          aria-label={t("order.progressLabel", {
            step: step + 1,
            total: TOTAL_STEPS,
            name: t(STEP_NAME_KEYS[step]),
          })}
        >
          <div className={styles.fill} style={{ width: `${pct}%` }} />
        </div>
        <ol className={styles.stepList}>
          {STEP_NAME_KEYS.map((key, index) => (
            <li
              key={key}
              className={`${styles.stepItem} ${index === step ? styles.currentStep : ""} ${index < step ? styles.completedStep : ""}`}
              aria-current={index === step ? "step" : undefined}
            >
              <span className={styles.stepNumber}>
                {index < step ? "✓" : String(index + 1).padStart(2, "0")}
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.summaryBar}>
        <span className={styles.summaryEyebrow}>
          {language === "en" ? "YOUR BOWL" : "TU BOWL"}
        </span>
        <div className={styles.summaryList} aria-live="polite">
          {summaryParts.length === 0 ? (
            <p className={styles.emptySummary}>
              {language === "en"
                ? "Start with a base — your bowl will show up here."
                : "Empieza por la base — aquí verás cómo va quedando."}
            </p>
          ) : (
            summaryParts.map((part) => (
              <span key={part.icon} className={styles.summaryItem}>
                <span aria-hidden="true">{part.icon}</span>
                <span>{part.text}</span>
              </span>
            ))
          )}
        </div>
        <span className={styles.price}>
          <span className={styles.priceAmount}>${price.amount} MXN</span>
          <span className={styles.priceCaption}>
            {price.isPromo
              ? language === "en" ? "for both bowls" : "por los 2 bowls"
              : price.isLarge
                ? language === "en" ? "Large bowl" : "Bowl grande"
                : language === "en" ? "Medium bowl" : "Bowl mediano"}
          </span>
        </span>
      </div>

      {steps[step]}
    </div>
  );
}
