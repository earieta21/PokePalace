import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import styles from "./BaseSelection.module.css";

import whiteRice from "../assets/base/whiteRice.webp";
import brownRice from "../assets/base/brownRice.webp";
import quinoa from "../assets/base/quinoa.webp";
import sobaNoodles from "../assets/base/sobaNoodles.webp";
import zoodles from "../assets/base/zoodles.webp";
import mixedGreens from "../assets/base/mixedGreens.webp";

const BaseSelection = ({ onNext }) => {
  const { order, updateOrder } = useOrder();

  const bases = [
    { id: "white_rice", name: "White Rice", image: whiteRice },
    { id: "brown_rice", name: "Brown Rice", image: brownRice },
    { id: "quinoa", name: "Quinoa", image: quinoa },
    { id: "mixed_greens", name: "Mixed Greens", image: mixedGreens },
    { id: "soba_noodles", name: "Soba Noodles", image: sobaNoodles },
    { id: "zoodles", name: "Zoodles", image: zoodles },
  ];

  const [selectedBase, setSelectedBase] = useState(order.base || null);

  const handleSelection = (baseId) => {
    setSelectedBase(baseId);
    updateOrder("base", baseId);
  };

  const handleNext = () => {
    if (selectedBase) onNext({ base: selectedBase });
    else alert("Please select a base before proceeding!");
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.badge}>Step 1 of 6</div>
          <h2 className={styles.title}>Choose your base</h2>
          <p className={styles.subtitle}>
            Start clean — rice, greens, or noodles.
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
            </button>
          ))}
        </div>

        <div className={styles.actions}>
          <button className={styles.nextButton} onClick={handleNext}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default BaseSelection;
