import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, Check, Leaf, ShoppingBag } from "lucide-react";
import LiveBowl from "./LiveBowl";

import BaseSelection from "./BaseSelection";
import ProteinSelection from "./ProteinSelection";
import MarinadeSelection from "./MarinadeSelection";
import ComplementsSelection from "./ComplementsSelection";
import SauceSelection from "./SauceSelection";
import ToppingsSelection from "./ToppingsSelection";
import { useOrder } from "./OrderContext";
import { ITEM_LABELS, getBaseLabel } from "./OrderLabels";
import {
  BOWL_BASE_PRICE,
  LARGE_BOWL_UPCHARGE,
  PROMO_2X1_BOWLS_PRICE,
} from "./pricing";
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

// Step names remain visible so customers can see the whole bowl-building flow.
function StepProgress({ step, t }) {
  const currentStepName = t(STEP_NAME_KEYS[step]);
  const pct = ((step + 1) / TOTAL_STEPS) * 100;
  return (
    <div className={styles.progress}>
      <div className={styles.progressRow}>
        <span className={styles.stepLabel}>{currentStepName}</span>
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
          name: currentStepName,
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
              {index < step ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                String(index + 1).padStart(2, "0")
              )}
            </span>
            <span>{t(key)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PausedBanner({ message, t }) {
  return (
    <div className={styles.paused}>
      <span aria-hidden="true" className={styles.pausedIcon}>
        ⏸
      </span>
      <div>
        <p className={styles.pausedTitle}>{t("order.pausedTitle")}</p>
        <p className={styles.pausedText}>
          {message || t("order.pausedFallback")}
        </p>
      </div>
    </div>
  );
}

function priceLabel(order, t) {
  if (order.promo2x1) {
    const stageLabel =
      order.promo2x1.stage === 1 ? "Bowl 1 de 2" : "Bowl 2 de 2";
    return `${stageLabel} · $${PROMO_2X1_BOWLS_PRICE} MXN por los 2`;
  }
  const isLarge = Array.isArray(order.proteins) && order.proteins.length >= 3;
  const price = isLarge
    ? BOWL_BASE_PRICE + LARGE_BOWL_UPCHARGE
    : BOWL_BASE_PRICE;
  return `$${price} MXN${isLarge ? ` · ${t("order.largeBowlSuffix")}` : ""}`;
}

function bowlSummaryParts({ order, language }) {
  const parts = [];
  const labels = ITEM_LABELS[language] || ITEM_LABELS.es;

  if (order.base) {
    parts.push({
      icon: "🍚",
      text: getBaseLabel(order.bases, order.base, language),
    });
  }
  if (Array.isArray(order.proteins) && order.proteins.length > 0) {
    const names = order.proteins.map((id) => labels.protein[id] || id);
    parts.push({ icon: "🐟", text: names.join(", ") });
  }
  if (Array.isArray(order.marinades) && order.marinades.length > 0) {
    parts.push({
      icon: "🧉",
      text: order.marinades.map((id) => labels.marinade[id] || id).join(", "),
    });
  }
  if (Array.isArray(order.complements) && order.complements.length > 0) {
    parts.push({
      icon: "🥗",
      text: order.complements
        .map((id) => labels.complement[id] || id)
        .join(", "),
    });
  }
  if (Array.isArray(order.sauces) && order.sauces.length > 0) {
    parts.push({
      icon: "🥣",
      text: order.sauces.map((id) => labels.sauce[id] || id).join(", "),
    });
  }

  if (order.toppings?.length > 0) {
    parts.push({
      icon: "✦",
      text: order.toppings.map((id) => labels.topping[id] || id).join(", "),
    });
  }

  return parts;
}

const OrderPage = () => {
  const {
    order,
    updateOrder,
    addBowlToCart,
    confirmPromoBowl,
    cancelPromo2x1,
  } = useOrder();
  const { language, t } = useLanguage();
  const cartCount = (order.cart || []).reduce((sum, line) => sum + line.qty, 0);
  const [step, setStep] = useState(() => {
    const savedStep = Number(order.draftStep);
    return Number.isInteger(savedStep) &&
      savedStep >= 0 &&
      savedStep <= LAST_STEP
      ? savedStep
      : 0;
  });
  const navigate = useNavigate();

  const [storeStatus, setStoreStatus] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/api/settings/store-status`)
      .then((r) => r.json())
      .then(setStoreStatus)
      .catch(() => {});
  }, []);

  const setOrderStep = useCallback(
    (nextStep) => {
      setStep(nextStep);
      updateOrder("draftStep", nextStep);
    },
    [updateOrder],
  );

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
    <ComplementsSelection
      key="complements"
      onNext={nextStep}
      onBack={prevStep}
    />,
    <SauceSelection key="sauce" onNext={nextStep} onBack={prevStep} />,
    <ToppingsSelection key="toppings" onNext={finishBowl} onBack={prevStep} />,
  ];

  const summaryParts = bowlSummaryParts({ order, language });

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link to="/" className={styles.wordmark}>
          POKE <span>PALACE</span>
        </Link>
        <div className={styles.topbarLinks}>
          <Link to="/menu" className={styles.menuLink}>
            {language === "en" ? "Explore the menu" : "Explorar el menú"}{" "}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          {/* La barra global de carrito (CartBar) no se monta aquí porque
              chocaría con los botones pegados al fondo del armador, así que
              el acceso al carrito vive en esta barra de arriba. */}
          {cartCount > 0 && (
            <Link to="/summary" className={styles.cartLink}>
              <ShoppingBag size={15} aria-hidden="true" />
              {language === "en" ? "Cart" : "Carrito"}
              <span className={styles.cartLinkCount}>{cartCount}</span>
            </Link>
          )}
        </div>
      </div>
      <section className={styles.hero} aria-labelledby="build-bowl-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <Leaf size={15} aria-hidden="true" />{" "}
            {language === "en"
              ? "FRESH INGREDIENTS. YOUR WAY."
              : "INGREDIENTES FRESCOS. A TU GUSTO."}
          </p>
          <h1 id="build-bowl-title">
            {language === "en" ? "Your bowl." : "Tu bowl."}
            <br />
            <em>{language === "en" ? "Your rules." : "Tus reglas."}</em>
          </h1>
          <p className={styles.heroDescription}>
            {language === "en"
              ? "Mix your favorites, discover new flavors and make every bite your own."
              : "Mezcla tus favoritos, descubre nuevos sabores y haz tuya cada cucharada."}
          </p>
          <span className={styles.heroNote}>
            {language === "en"
              ? "6 steps to your perfect combination"
              : "6 pasos para tu combinación perfecta"}
          </span>
        </div>
        <div className={styles.heroVisual}>
          <LiveBowl order={order} language={language} />
        </div>
      </section>
      <div className={styles.head}>
        {storeStatus?.ordersPaused && (
          <PausedBanner message={storeStatus.pausedMessage} t={t} />
        )}
        <StepProgress step={step} t={t} />
      </div>
      <div className={styles.builderLayout}>
        <div className={styles.builder}>{steps[step]}</div>
        <aside
          className={styles.bowlPreview}
          aria-label={
            language === "en" ? "Your bowl so far" : "Tu bowl hasta ahora"
          }
        >
          <div className={styles.previewHeading}>
            <span className={styles.eyebrow}>
              {language === "en" ? "YOUR CREATION" : "TU CREACIÓN"}
            </span>
            <ShoppingBag size={19} aria-hidden="true" />
          </div>
          <h2 className={styles.previewTitle}>
            {language === "en" ? "Your bowl, live." : "Tu bowl, en vivo."}
          </h2>
          <p className={styles.previewHint}>
            {language === "en"
              ? "Each ingredient you choose appears here."
              : "Cada ingrediente que elijas aparece aquí."}
          </p>
          <div className={styles.livePreview}>
            <LiveBowl order={order} language={language} compact />
          </div>
          <p
            className={styles.mobileSelection}
            aria-live="polite"
            aria-atomic="true"
          >
            {summaryParts.length
              ? summaryParts.map((part) => part.text).join(" · ")
              : language === "en"
                ? "Choose an ingredient to start."
                : "Elige un ingrediente para empezar."}
          </p>
          <span className={styles.mobilePrice}>{priceLabel(order, t)}</span>
          <div className={styles.summary} aria-live="polite">
            {summaryParts.length === 0 && (
              <p className={styles.emptySummary}>
                {language === "en"
                  ? "Start with a base. Your combination will appear here."
                  : "Empieza por la base. Aquí verás cómo va quedando tu combinación."}
              </p>
            )}
            {summaryParts.map((p, i) => (
              <React.Fragment key={i}>
                <span className={styles.summaryItem}>
                  <span aria-hidden="true">{p.icon}</span>
                  <span>{p.text}</span>
                </span>
              </React.Fragment>
            ))}
          </div>
          <div className={styles.priceBlock}>
            <span className={styles.priceCaption}>
              {order.promo2x1
                ? language === "en"
                  ? "Promotion"
                  : "Promoción"
                : language === "en"
                  ? "Bowl base price"
                  : "Precio base del bowl"}
            </span>
            <span className={styles.price}>{priceLabel(order, t)}</span>
            {!order.promo2x1 && (
              <small>
                {language === "en"
                  ? "Extras are added in your cart."
                  : "Los extras se suman en tu carrito."}
              </small>
            )}
          </div>
          <Link to="/menu" className={styles.previewLink}>
            {language === "en"
              ? "Prefer a house bowl?"
              : "¿Prefieres un bowl de la casa?"}{" "}
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </main>
  );
};

export default OrderPage;
