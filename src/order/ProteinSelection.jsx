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
  const MIN_PROTEINS = 2;
  const MAX_PROTEINS = 3;

  const proteins = [
    { id: "tuna", name: "Atún", image: tuna },
    { id: "salmon", name: "Salmón", image: salmon },
    { id: "shrimp", name: "Camarón", image: shrimp },
    { id: "octopus", name: "Pulpo", image: octopus },
    { id: "seared_tuna", name: "Atún Sellado", image: searedTuna },
  ];

  const [selectedProteins, setSelectedProteins] = useState(() => {
    if (Array.isArray(order.proteins) && order.proteins.length > 0) return order.proteins;
    return order.protein ? [order.protein] : [];
  });
  const [error, setError] = useState("");

  const handleSelection = (proteinId) => {
    setSelectedProteins((prev) => {
      const next = prev.includes(proteinId)
        ? prev.filter((id) => id !== proteinId)
        : prev.length < MAX_PROTEINS
          ? [...prev, proteinId]
          : prev;

      if (!prev.includes(proteinId) && prev.length >= MAX_PROTEINS) {
        setError("Puedes seleccionar máximo 3 proteínas.");
        return prev;
      }

      updateOrder("proteins", next);
      updateOrder("protein", next.join(", "));
      updateOrder("bowlSize", next.length === MAX_PROTEINS ? "large" : "normal");
      updateOrder("proteinUpcharge", next.length === MAX_PROTEINS ? 1 : 0);
      setError("");
      return next;
    });
  };

  const handleNext = () => {
    if (selectedProteins.length < MIN_PROTEINS) {
      setError("Selecciona 2 proteínas para el bowl normal o 3 para bowl grande.");
      return;
    }
    onNext();
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>Paso 2 de 6</div>
        <h2 className={styles.title}>Elige tus proteínas</h2>
        <p className={styles.subtitle}>
          Bowl normal: 2 proteínas. Bowl grande: 3 proteínas con costo extra.
        </p>
      </div>

      <div className={styles.selectionInfo}>
        <span>{selectedProteins.length} / {MAX_PROTEINS} seleccionadas</span>
        <strong>{selectedProteins.length === MAX_PROTEINS ? "Bowl grande" : "Bowl normal"}</strong>
      </div>

      <div className={styles.grid}>
        {proteins.map((protein) => {
          const selectedIndex = selectedProteins.indexOf(protein.id);
          const isSelected = selectedIndex >= 0;
          return (
          <button
            key={protein.id}
            type="button"
            className={`${styles.card} ${
              isSelected ? styles.selected : ""
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
              {isSelected && (
                <span className={styles.selectedBadge}>{selectedIndex + 1}</span>
              )}
            </div>

            <p className={styles.name}>{protein.name}</p>
          </button>
          );
        })}
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
