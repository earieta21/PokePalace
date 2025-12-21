import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import styles from "./ComplementsSelection.module.css";

import aguacate from "../assets/complements/aguacate.webp";
import algas from "../assets/complements/algas.webp";
import chia from "../assets/complements/chia.webp";
import chicharos from "../assets/complements/chicharos.webp";
import colRizado from "../assets/complements/colRizado.webp";
import edamames from "../assets/complements/edamames.webp";
import jicama from "../assets/complements/jicama.webp";
import maiz from "../assets/complements/maiz.webp";
import mango from "../assets/complements/mango.webp";
import pepino from "../assets/complements/pepino.webp";
import pina from "../assets/complements/pina.webp";
import redpeper from "../assets/complements/redpeper.webp";
import zanahoria from "../assets/complements/zanahoria.webp";

const MAX_COMPLEMENTS = 6;

const ComplementsSelection = ({ onNext }) => {
  const { order, updateOrder } = useOrder();

  const complements = [
    {
      id: "shredded_carrots",
      name: "Zanahoria Rallada (Shredded Carrots)",
      image: zanahoria,
    },
    { id: "cucumber", name: "Pepino (Cucumber)", image: pepino },
    { id: "mango", name: "Mango (Mango)", image: mango },
    { id: "jicama", name: "Jícama (Jicama)", image: jicama },
    { id: "seaweed", name: "Algas (Seaweed)", image: algas },
    { id: "avocado", name: "Aguacate (Avocado)", image: aguacate },
    { id: "edamame", name: "Edamame (Edamame)", image: edamames },
    { id: "kale", name: "Col Rizada (Kale)", image: colRizado },
    { id: "peas", name: "Chícharos (Peas)", image: chicharos },
    {
      id: "red_bell_pepper",
      name: "Pimiento Rojo (Red Bell Pepper)",
      image: redpeper,
    },
    { id: "corn", name: "Maíz (Corn)", image: maiz },
    { id: "pineapple", name: "Piña (Pineapple)", image: pina },
    { id: "chia_seeds", name: "Semillas de Chía (Chia Seeds)", image: chia },
  ];

  const [selectedComplements, setSelectedComplements] = useState(
    order.complements || []
  );

  const toggleComplement = (complementId) => {
    setSelectedComplements((prev) => {
      // remove
      if (prev.includes(complementId)) {
        const updated = prev.filter((id) => id !== complementId);
        updateOrder("complements", updated);
        return updated;
      }

      // add (limit)
      if (prev.length >= MAX_COMPLEMENTS) {
        alert(`You can select up to ${MAX_COMPLEMENTS} complements.`);
        return prev;
      }

      const updated = [...prev, complementId];
      updateOrder("complements", updated);
      return updated;
    });
  };

  const handleNext = () => {
    if (selectedComplements.length > 0) {
      onNext({ complements: selectedComplements });
    } else {
      alert("Please select at least one complement before proceeding!");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>Step 4 of 6</div>
        <h2 className={styles.title}>Choose your complements</h2>
        <p className={styles.subtitle}>
          Add crunch, sweetness, and greens. Choose up to {MAX_COMPLEMENTS}.
        </p>
      </div>

      <div className={styles.grid}>
        {complements.map((complement) => (
          <button
            key={complement.id}
            type="button"
            className={`${styles.card} ${
              selectedComplements.includes(complement.id) ? styles.selected : ""
            }`}
            onClick={() => toggleComplement(complement.id)}
          >
            <div className={styles.imageWrap}>
              <img
                src={complement.image}
                alt={complement.name}
                className={styles.image}
                loading="lazy"
              />
              <div className={styles.imageOverlay} />
            </div>
            <p className={styles.name}>{complement.name}</p>
          </button>
        ))}
      </div>

      <div className={styles.actions}>
        <span className={styles.helper}>
          Selected {selectedComplements.length} / {MAX_COMPLEMENTS}
        </span>

        <button className={styles.nextButton} onClick={handleNext}>
          Next
        </button>
      </div>
    </div>
  );
};

export default ComplementsSelection;
