import BaseSelection from "./BaseSelection";
import ProteinSelection from "./ProteinSelection";
import MarinadeSelection from "./MarinadeSelection";
import ComplementsSelection from "./ComplementsSelection";
import SauceSelection from "./SauceSelection";
import ToppingsSelection from "./ToppingsSelection";
import OrderSummary from "./OrderSummary";
import React, { useContext, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../config";

const OrderPage = () => {
  const [step, setStep] = useState(0);
  const { token } = useContext(AuthContext);
  const [saving, setSaving] = useState(false);

  const nextStep = () => {
    setStep((prev) => prev + 1);
  };

  const steps = [
    <BaseSelection onNext={nextStep} />,
    <ProteinSelection onNext={nextStep} />,
    <MarinadeSelection onNext={nextStep} />,
    <ComplementsSelection onNext={nextStep} />,
    <SauceSelection onNext={nextStep} />,
    <ToppingsSelection onNext={nextStep} />,
    <OrderSummary
      onEditStep={(stepIndex) => setStep(stepIndex)}
      onConfirm={async () => {
        try {
          setSaving(true);

          const res = await fetch(`${API_URL}/api/orders`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(order),
          });

          const data = await res.json();
          if (!res.ok)
            throw new Error(data?.msg || "No se pudo guardar la orden");

          alert("✅ Order saved!");
          // opcional: reset order / mandar a mi-cuenta
        } catch (e) {
          alert(`❌ ${e.message}`);
        } finally {
          setSaving(false);
        }
      }}
    />,
  ];

  return <div>{steps[step]}</div>;
};

export default OrderPage;
