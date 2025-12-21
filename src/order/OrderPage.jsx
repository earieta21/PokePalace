import React, { useState } from "react";
import BaseSelection from "./BaseSelection";
import ProteinSelection from "./ProteinSelection";
import MarinadeSelection from "./MarinadeSelection";
import ComplementsSelection from "./ComplementsSelection";
import SauceSelection from "./SauceSelection";
import ToppingsSelection from "./ToppingsSelection";
import OrderSummary from "./OrderSummary";

const OrderPage = () => {
  const [step, setStep] = useState(0);

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
      onConfirm={() => alert("Order Confirmed!")}
    />,
  ];

  return <div>{steps[step]}</div>;
};

export default OrderPage;
