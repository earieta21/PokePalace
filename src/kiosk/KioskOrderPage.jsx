import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useOrder } from "../order/OrderContext";
import useIdleTimeout from "./useIdleTimeout";

import BaseSelection from "../order/BaseSelection";
import ProteinSelection from "../order/ProteinSelection";
import MarinadeSelection from "../order/MarinadeSelection";
import ComplementsSelection from "../order/ComplementsSelection";
import SauceSelection from "../order/SauceSelection";
import ToppingsSelection from "../order/ToppingsSelection";

const IDLE_TIMEOUT_MS = 60000;
const LAST_STEP = 5;

export default function KioskOrderPage() {
  const { order, updateOrder, resetOrder, addBowlToCart } = useOrder();
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

  const setOrderStep = (nextStep) => {
    setStep(nextStep);
    updateOrder("draftStep", nextStep);
  };
  const nextStep = () => setOrderStep(Math.min(step + 1, LAST_STEP));
  const prevStep = () => setOrderStep(Math.max(0, step - 1));

  // Confirma el bowl en construcción como línea del carrito y regresa al
  // menú para que el cliente decida si agrega otro bowl/artículo o va al
  // carrito — igual que en la app web.
  const finishBowl = () => {
    addBowlToCart();
    navigate("/kiosk/menu");
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