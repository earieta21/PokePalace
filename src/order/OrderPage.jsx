import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import BaseSelection from "./BaseSelection";
import ProteinSelection from "./ProteinSelection";
import MarinadeSelection from "./MarinadeSelection";
import ComplementsSelection from "./ComplementsSelection";
import SauceSelection from "./SauceSelection";
import ToppingsSelection from "./ToppingsSelection";
import { useOrder } from "./OrderContext";

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

  // ✅ detecta si vienes desde summary a editar solo un paso
  const editMode = searchParams.get("edit") === "1";

  const setOrderStep = useCallback((nextStep) => {
    setStep(nextStep);
    updateOrder("draftStep", nextStep);
  }, [updateOrder]);

  // ✅ Soporta /order?step=3 (para editar desde Summary)
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

  // ✅ Siempre regresa a summary y mantiene guest
  const goToSummary = () => {
    updateOrder("draftStep", 5);
    navigate("/summary", { state: { guest: isGuest } });
  };

  // ✅ Cuando estás editando, el "Next" debe volver a summary
  const handleNext = () => {
    if (editMode) {
      goToSummary();
      return;
    }
    nextStep();
  };

  const steps = [
    <BaseSelection key="base" onNext={handleNext} />,
    <ProteinSelection key="protein" onNext={handleNext} />,
    <MarinadeSelection key="marinade" onNext={handleNext} />,
    <ComplementsSelection key="complements" onNext={handleNext} />,
    <SauceSelection key="sauce" onNext={handleNext} />,
    // ✅ En el último paso, siempre termina en summary
    <ToppingsSelection key="toppings" onNext={goToSummary} />,
  ];

  return <div>{steps[step]}</div>;
};

export default OrderPage;
