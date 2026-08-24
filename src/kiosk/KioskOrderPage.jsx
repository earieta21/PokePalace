import { useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useOrder } from "../order/OrderContext";
import useIdleTimeout from "./useIdleTimeout";

import BaseSelection from "../order/BaseSelection";
import ProteinSelection from "../order/ProteinSelection";
import ComplementsSelection from "../order/ComplementsSelection";
import SauceSelection from "../order/SauceSelection";
import ToppingsSelection from "../order/ToppingsSelection";

const IDLE_TIMEOUT_MS = 60000;

export default function KioskOrderPage() {
  const location = useLocation();
  const [step, setStep] = useState(() => location.state?.initialStep ?? 0);
  const navigate = useNavigate();
  const { resetOrder } = useOrder();

  const goToWelcome = useCallback(() => {
    resetOrder();
    navigate("/kiosk", { replace: true });
  }, [resetOrder, navigate]);

  useIdleTimeout(goToWelcome, IDLE_TIMEOUT_MS);

  const nextStep = () => setStep((prev) => prev + 1);
  const prevStep = () => setStep((prev) => Math.max(0, prev - 1));
  const goToSummary = () => navigate("/kiosk/summary");

  const steps = [
    <BaseSelection key="base" onNext={nextStep} onBack={prevStep} />,
    <ProteinSelection key="protein" onNext={nextStep} onBack={prevStep} />,
    <ComplementsSelection key="complements" onNext={nextStep} onBack={prevStep} />,
    <SauceSelection key="sauce" onNext={nextStep} onBack={prevStep} />,
    <ToppingsSelection key="toppings" onNext={goToSummary} onBack={prevStep} />,
  ];

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={goToWelcome}
        style={{
          position: "fixed",
          top: 14,
          right: 14,
          zIndex: 50,
          padding: "9px 16px",
          borderRadius: 999,
          border: "1px solid #ddd",
          background: "#fff",
          color: "#555",
          fontWeight: 700,
          fontSize: 12.5,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        Cancelar pedido
      </button>
      {steps[step]}
    </div>
  );
}
