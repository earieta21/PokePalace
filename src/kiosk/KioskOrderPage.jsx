import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useOrder } from "../order/OrderContext";
import { PROMO_2X1_BOWLS_PRICE } from "../order/pricing";
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
  const { order, updateOrder, resetOrder, addBowlToCart, confirmPromoBowl } = useOrder();
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
      {order.promo2x1 && (
        <div
          style={{
            position: "fixed",
            top: 14,
            left: 14,
            zIndex: 50,
            padding: "9px 16px",
            borderRadius: 999,
            background: "#14315c",
            color: "#fff",
            fontWeight: 800,
            fontSize: 12.5,
          }}
        >
          {order.promo2x1.stage === 1 ? "Bowl 1 de 2" : "Bowl 2 de 2"} · 2x1 en Bowls · ${PROMO_2X1_BOWLS_PRICE} MXN por los 2 🎉
        </div>
      )}
      {steps[step]}
    </div>
  );
}