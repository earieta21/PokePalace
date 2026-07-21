import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import BaseSelection from "./BaseSelection";
import ProteinSelection from "./ProteinSelection";
import ComplementsSelection from "./ComplementsSelection";
import SauceSelection from "./SauceSelection";
import ToppingsSelection from "./ToppingsSelection";
import { useOrder } from "./OrderContext";
import { ITEM_LABELS } from "./OrderLabels";
import { BOWL_BASE_PRICE, LARGE_BOWL_UPCHARGE } from "./pricing";
import { API_URL } from "../config";
import { useLanguage } from "../i18n/LanguageContext";

const TOTAL_STEPS = 5;
const LAST_STEP = TOTAL_STEPS - 1;
const SUMMARY_STEP = TOTAL_STEPS;
const STEP_NAME_KEYS = [
  "summary.base",
  "summary.protein",
  "summary.complements",
  "summary.sauces",
  "summary.toppings",
];

const PRESETS = [
  {
    id: "classic_salmon",
    nameKey: "order.presetClassicSalmon",
    tagKey: "order.presetMostOrdered",
    base: "white_rice",
    proteins: ["salmon", "tuna"],
    bowlSize: "normal",
    complements: ["avocado", "cucumber", "edamame"],
    sauces: ["spicy_mayo", "citrus_dressing"],
    toppings: ["sesame_seeds", "nori_strips"],
  },
  {
    id: "tropical_shrimp",
    nameKey: "order.presetTropicalShrimp",
    tagKey: "order.presetFreshLight",
    base: "spring_mix",
    proteins: ["shrimp", "tofu"],
    bowlSize: "normal",
    complements: ["pineapple", "avocado", "cucumber"],
    sauces: ["sweet_dressing", "cilantro_dressing"],
    toppings: ["sesame_seeds", "masago"],
  },
  {
    id: "spicy_tuna",
    nameKey: "order.presetSpicyTuna",
    tagKey: "order.presetFlavorful",
    base: "quinoa",
    proteins: ["tuna", "salmon"],
    bowlSize: "normal",
    complements: ["cucumber", "edamame", "spicy_surimi"],
    sauces: ["sriracha", "spicy_mayo"],
    toppings: ["masago", "nori_strips"],
  },
  {
    id: "citrus_octopus",
    nameKey: "order.presetCitrusTofu",
    tagKey: "order.presetFreshLight",
    base: "spring_mix",
    proteins: ["tofu", "shrimp"],
    bowlSize: "normal",
    complements: ["cucumber", "beet", "avocado"],
    sauces: ["citrus_dressing", "cilantro_dressing"],
    toppings: ["sesame_seeds", "nori_strips"],
  },
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
    parts.push({ icon: "🍚", text: labels.base[order.base] || order.base });
  }
  if (Array.isArray(order.proteins) && order.proteins.length > 0) {
    const names = order.proteins.map((id) => labels.protein[id] || id);
    parts.push({ icon: "🐟", text: names.join(", ") });
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

function PresetBowls({ onSelect, t }) {
  return (
    <div style={{ padding: "6px 20px 0", maxWidth: 960, margin: "0 auto" }}>
      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.3px", textTransform: "uppercase" }}>
        {t("order.presetStart")}
      </p>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
        {PRESETS.map((preset) => (
          <button
            key={preset.nameKey}
            type="button"
            onClick={() => onSelect(preset)}
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 4,
              padding: "12px 14px",
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              cursor: "pointer",
              textAlign: "left",
              minWidth: 150,
              transition: "border-color 150ms ease, box-shadow 150ms ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(74,122,90,0.15)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 7px",
              borderRadius: 999, background: "var(--accent-bg)",
              border: "1px solid var(--accent-border)", color: "var(--accent)",
              letterSpacing: "0.3px",
            }}>
              {t(preset.tagKey)}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>
              {t(preset.nameKey)}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500 }}>
              {preset.proteins.length === 3 ? `$${BOWL_BASE_PRICE + LARGE_BOWL_UPCHARGE}` : `$${BOWL_BASE_PRICE}`} MXN · {t("order.presetCustomizable")}
            </span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 4px" }}>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500 }}>{t("order.presetFromScratch")}</span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
    </div>
  );
}

const OrderPage = () => {
  const { order, updateOrder, loadFavorite } = useOrder();
  const { language, t } = useLanguage();
  const [step, setStep] = useState(() => {
    const savedStep = Number(order.draftStep);
    return Number.isInteger(savedStep) && savedStep >= 0 && savedStep <= LAST_STEP ? savedStep : 0;
  });
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isGuest = Boolean(location.state?.guest);
  const editMode = searchParams.get("edit") === "1";
  const requestedPreset = searchParams.get("preset");

  const [storeStatus, setStoreStatus] = useState(null);
  useEffect(() => {
    fetch(`${API_URL}/api/settings/store-status`)
      .then((r) => r.json())
      .then(setStoreStatus)
      .catch(() => {});
  }, []);

  // Si el cliente ya había llegado al resumen y vuelve a entrar
  // a "Ordenar" desde el menú sin pedir un paso específico, regrésalo
  // directo al resumen en vez de dejarlo en el último paso del armador.
  useEffect(() => {
    if (!searchParams.has("step") && !requestedPreset && Number(order.draftStep) >= SUMMARY_STEP) {
      navigate("/summary", { state: { guest: isGuest }, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!requestedPreset) return;
    const preset = PRESETS.find((candidate) => candidate.id === requestedPreset);
    if (!preset) return;
    loadFavorite(preset);
    updateOrder("draftStep", SUMMARY_STEP);
    navigate("/summary", { state: { guest: isGuest }, replace: true });
  }, [isGuest, loadFavorite, navigate, requestedPreset, updateOrder]);

  const setOrderStep = useCallback((nextStep) => {
    setStep(nextStep);
    updateOrder("draftStep", nextStep);
  }, [updateOrder]);

  useEffect(() => {
    if (!searchParams.has("step")) return;
    const qsStep = Number(searchParams.get("step"));
    if (!Number.isNaN(qsStep) && qsStep >= 0 && qsStep <= LAST_STEP) {
      setOrderStep(qsStep);
    }
  }, [searchParams, setOrderStep]);

  const nextStep = () => {
    const next = Math.min(step + 1, LAST_STEP);
    setOrderStep(next);
  };

  const prevStep = () => {
    if (step === 0) {
      navigate(-1);
      return;
    }
    setOrderStep(Math.max(step - 1, 0));
  };

  const goToSummary = () => {
    // TOTAL_STEPS es un valor centinela: significa "ya llegó al resumen",
    // distinto de estar en el último paso del armador. Así, si vuelve a entrar
    // a "Ordenar" más tarde, lo mandamos directo al resumen otra vez.
    updateOrder("draftStep", SUMMARY_STEP);
    navigate("/summary", { state: { guest: isGuest } });
  };

  const handleNext = () => {
    if (editMode) {
      goToSummary();
      return;
    }
    nextStep();
  };

  const handleSelectPreset = (preset) => {
    loadFavorite(preset);
    updateOrder("draftStep", SUMMARY_STEP);
    navigate("/summary", { state: { guest: isGuest } });
  };

  const steps = [
    <BaseSelection key="base" onNext={handleNext} onBack={prevStep} />,
    <ProteinSelection key="protein" onNext={handleNext} onBack={prevStep} />,
    <ComplementsSelection key="complements" onNext={handleNext} onBack={prevStep} />,
    <SauceSelection key="sauce" onNext={handleNext} onBack={prevStep} />,
    <ToppingsSelection key="toppings" onNext={goToSummary} onBack={prevStep} />,
  ];

  return (
    <div>
      {storeStatus?.ordersPaused && <PausedBanner message={storeStatus.pausedMessage} t={t} />}
      <StepProgress step={step} t={t} />
      <PriceChip order={order} t={t} />
      <BowlMiniSummary order={order} step={step} language={language} t={t} />
      {step === 0 && !order.base && (
        <PresetBowls onSelect={handleSelectPreset} t={t} />
      )}
      {steps[step]}
    </div>
  );
};

export default OrderPage;
