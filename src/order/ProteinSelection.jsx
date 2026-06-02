import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import styles from "./ProteinSelection.module.css";

import tuna from "../assets/protein/tuna.webp";
import salmon from "../assets/protein/salmon.webp";
import shrimp from "../assets/protein/shrimp.webp";
import octopus from "../assets/protein/octopus.webp";
import searedTuna from "../assets/protein/searedTuna.webp";

const ProteinSelection = ({ onNext }) => {
  const { order, updateOrder } = useOrder();

  const proteins = [
    { id: "tuna", name: "Atún", image: tuna },
    { id: "salmon", name: "Salmón", image: salmon },
    { id: "shrimp", name: "Camarón", image: shrimp },
    { id: "octopus", name: "Pulpo", image: octopus },
    { id: "seared_tuna", name: "Atún Sellado", image: searedTuna },
  ];

  const [selectedProtein, setSelectedProtein] = useState(order.protein || null);
  const [error, setError] = useState("");

  const handleSelection = (proteinId) => {
    setSelectedProtein(proteinId);
    updateOrder("protein", proteinId);
    setError("");
  };

  const handleNext = () => {
    if (!selectedProtein) {
      setError("Selecciona una proteína para continuar.");
      return;
    }
    onNext();
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>Paso 2 de 6</div>
        <h2 className={styles.title}>Elige tu proteína</h2>
        <p className={styles.subtitle}>El ingrediente estrella de tu bowl.</p>
      </div>

      <div className={styles.grid}>
        {proteins.map((protein) => (
          <button
            key={protein.id}
            type="button"
            className={`${styles.card} ${
              selectedProtein === protein.id ? styles.selected : ""
            }`}
            onClick={() => handleSelection(protein.id)}
          >
            <div className={styles.imageWrap}>
              <img
                src={protein.image}
                alt={protein.name}
                className={styles.image}
                loading="lazy"
              />
              <div className={styles.imageOverlay} />
            </div>

            <p className={styles.name}>{protein.name}</p>
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
  );
};

export default ProteinSelection;
