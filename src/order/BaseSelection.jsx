import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import styles from "./BaseSelection.module.css";

import whiteRice from "../assets/base/whiteRice.webp";
import brownRice from "../assets/base/brownRice.webp";
import quinoa from "../assets/base/quinoa.webp";
import mixedGreens from "../assets/base/mixedGreens.webp";

const BaseSelection = ({ onNext }) => {
  const { order, updateOrder } = useOrder();

  const bases = [
    { id: "white_rice", name: "Arroz Blanco", image: whiteRice },
    { id: "brown_rice", name: "Arroz Integral", image: brownRice },
    { id: "quinoa", name: "Quinoa", image: quinoa },
    { id: "spring_mix", name: "Spring Mix", description: "Arroz con ensalada", image: mixedGreens },
  ];

  const [selectedBase, setSelectedBase] = useState(order.base || null);
  const [error, setError] = useState("");

  const handleSelection = (baseId) => {
    setSelectedBase(baseId);
    updateOrder("base", baseId);
    setError("");
  };

  const handleNext = () => {
    if (!selectedBase) {
      setError("Selecciona una base para continuar.");
      return;
    }
    onNext();
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.badge}>Paso 1 de 6</div>
          <h2 className={styles.title}>Elige tu base</h2>
          <p className={styles.subtitle}>
            Elige entre arroz blanco, integral, quinoa o spring mix.
          </p>
        </div>

        <div className={styles.grid}>
          {bases.map((base) => (
            <button
              key={base.id}
              type="button"
              className={`${styles.card} ${
                selectedBase === base.id ? styles.selected : ""
              }`}
              onClick={() => handleSelection(base.id)}
            >
              <div className={styles.imageWrap}>
                <img
                  src={base.image}
                  alt={base.name}
                  className={styles.image}
                />
                <div className={styles.imageOverlay} />
              </div>

              <p className={styles.name}>{base.name}</p>
              {base.description && (
                <p className={styles.description}>{base.description}</p>
              )}
            </button>
          ))}
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button className={styles.nextButton} onClick={handleNext}>
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
};

export default BaseSelection;
