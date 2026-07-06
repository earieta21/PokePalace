import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import BaseSelection from "./BaseSelection";
import ProteinSelection from "./ProteinSelection";
import MarinadeSelection from "./MarinadeSelection";
import ComplementsSelection from "./ComplementsSelection";
import SauceSelection from "./SauceSelection";
import ToppingsSelection from "./ToppingsSelection";
import { useOrder } from "./OrderContext";
import { BASE_LABELS, PROTEIN_LABELS } from "./OrderLabels";
import { BOWL_BASE_PRICE, LARGE_BOWL_UPCHARGE } from "./pricing";

const TOTAL_STEPS = 6;
const STEP_NAMES = ["Base", "Proteínas", "Marinados", "Complementos", "Salsas", "Toppings"];

const PRESETS = [
  {
    name: "Clásico Salmón",
    tag: "El más pedido",
    base: "white_rice",
    proteins: ["salmon", "tuna"],
    bowlSize: "normal",
    marinades: ["shoyu_marinade"],
    complements: ["avocado", "cucumber", "edamame"],
    sauces: ["spicy_mayo", "soy_sauce"],
    toppings: ["sesame_seeds", "nori_strips"],
  },
  {
    name: "Tropical Camarón",
    tag: "Fresco y ligero",
    base: "spring_mix",
    proteins: ["shrimp", "salmon"],
    bowlSize: "normal",
    marinades: ["citrus_marinade"],
    complements: ["mango", "pineapple", "avocado"],
    sauces: ["sweet_chili", "avocado_lime"],
    toppings: ["sesame_seeds", "crispy_onions"],
  },
  {
    name: "Atún Picante",
    tag: "Con mucho sabor",
    base: "brown_rice",
    proteins: ["tuna", "seared_tuna"],
    bowlSize: "normal",
    marinades: ["spicy_marinade"],
    complements: ["cucumber", "edamame", "corn"],
    sauces: ["garlic_sriracha", "spicy_mayo"],
    toppings: ["red_pepper_flakes", "furikake"],
  },
];

function StepProgress({ step }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      padding: "14px 20px 4px",
      maxWidth: 960,
      margin: "0 auto",
    }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <React.Fragment key={i}>
          <div
            title={STEP_NAMES[i]}
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

function PriceChip({ order }) {
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
        ${price} MXN{isLarge ? " · Bowl grande" : ""}
      </span>
    </div>
  );
}

function BowlMiniSummary({ order, step }) {
  if (step === 0) return null;

  const parts = [];

  if (order.base) {
    parts.push({ icon: "🍚", text: BASE_LABELS[order.base] || order.base });
  }
  if (Array.isArray(order.proteins) && order.proteins.length > 0) {
    const names = order.proteins.map((id) => PROTEIN_LABELS[id] || id);
    parts.push({ icon: "🐟", text: names.join(", ") });
  }
  if (step >= 3 && Array.isArray(order.marinades) && order.marinades.length > 0) {
    parts.push({ icon: "✨", text: `${order.marinades.length} marinado${order.marinades.length > 1 ? "s" : ""}` });
  }
  if (step >= 4 && Array.isArray(order.complements) && order.complements.length > 0) {
    parts.push({ icon: "🥗", text: `${order.complements.length} complemento${order.complements.length > 1 ? "s" : ""}` });
  }
  if (step >= 5 && Array.isArray(order.sauces) && order.sauces.length > 0) {
    parts.push({ icon: "🥣", text: `${order.sauces.length} salsa${order.sauces.length > 1 ? "s" : ""}` });
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
            <span>{p.icon}</span>
            <span>{p.text}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function PresetBowls({ onSelect }) {
  return (
    <div style={{ padding: "6px 20px 0", maxWidth: 960, margin: "0 auto" }}>
      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.3px", textTransform: "uppercase" }}>
        Empezar desde un bowl de la casa
      </p>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
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
              {preset.tag}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>
              {preset.name}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500 }}>
              {preset.proteins.length === 3 ? `$${BOWL_BASE_PRICE + LARGE_BOWL_UPCHARGE}` : `$${BOWL_BASE_PRICE}`} MXN · Personalizable
            </span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 4px" }}>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500 }}>o arma el tuyo desde cero</span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
    </div>
  );
}

const OrderPage = () => {
  const { order, updateOrder, loadFavorite } = useOrder();
  const [step, setStep] = useState(() => {
    const savedStep = Number(order.draftStep);
    return Number.isInteger(savedStep) && savedStep >= 0 && savedStep <= 5 ? savedStep : 0;
  });
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isGuest = Boolean(location.state?.guest);
  const editMode = searchParams.get("edit") === "1";

  const setOrderStep = useCallback((nextStep) => {
    setStep(nextStep);
    updateOrder("draftStep", nextStep);
  }, [updateOrder]);

  useEffect(() => {
    if (!searchParams.has("step")) return;
    const qsStep = Number(searchParams.get("step"));
    if (!Number.isNaN(qsStep) && qsStep >= 0 && qsStep <= 5) {
      setOrderStep(qsStep);
    }
  }, [searchParams, setOrderStep]);

  const nextStep = () => {
    const next = Math.min(step + 1, 5);
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
    updateOrder("draftStep", 5);
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
    navigate("/summary", { state: { guest: isGuest } });
  };

  const steps = [
    <BaseSelection key="base" onNext={handleNext} onBack={prevStep} />,
    <ProteinSelection key="protein" onNext={handleNext} onBack={prevStep} />,
    <MarinadeSelection key="marinade" onNext={handleNext} onBack={prevStep} />,
    <ComplementsSelection key="complements" onNext={handleNext} onBack={prevStep} />,
    <SauceSelection key="sauce" onNext={handleNext} onBack={prevStep} />,
    <ToppingsSelection key="toppings" onNext={goToSummary} onBack={prevStep} />,
  ];

  return (
    <div>
      <StepProgress step={step} />
      <PriceChip order={order} />
      <BowlMiniSummary order={order} step={step} />
      {step === 0 && !order.base && (
        <PresetBowls onSelect={handleSelectPreset} />
      )}
      {steps[step]}
    </div>
  );
};

export default OrderPage;
