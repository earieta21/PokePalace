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
    { id: "tuna", name: "Tuna", image: tuna },
    { id: "salmon", name: "Salmon", image: salmon },
    { id: "shrimp", name: "Shrimp", image: shrimp },
    { id: "octopus", name: "Octopus", image: octopus },
    { id: "seared_tuna", name: "Seared Tuna", image: searedTuna },
  ];

  const [selectedProtein, setSelectedProtein] = useState(order.protein || null);

  const handleSelection = (proteinId) => {
    setSelectedProtein(proteinId);
    updateOrder("protein", proteinId);
  };

  const handleNext = () => {
    if (selectedProtein) {
      onNext({ protein: selectedProtein });
    } else {
      alert("Please select a protein before proceeding!");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>Step 2 of 6</div>
        <h2 className={styles.title}>Choose your protein</h2>
        <p className={styles.subtitle}>Pick the main flavor of your bowl.</p>
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

      <div className={styles.actions}>
        <button className={styles.nextButton} onClick={handleNext}>
          Next
        </button>
      </div>
    </div>
  );
};

export default ProteinSelection;
