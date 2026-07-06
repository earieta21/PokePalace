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

const TOTAL_STEPS = 6;
const STEP_NAMES = ["Base", "Proteínas", "Marinados", "Complementos", "Salsas", "Toppings"];

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
      padding: "4px 20px 8px",
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

const OrderPage = () => {
  const { order, updateOrder } = useOrder();
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
      <BowlMiniSummary order={order} step={step} />
      {steps[step]}
    </div>
  );
};

export default OrderPage;
