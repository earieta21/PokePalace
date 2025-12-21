import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import styles from "./ToppingsSelection.module.css";

import ajonjoli from "../assets/toppings/ajonjoli.webp";
import algaNori from "../assets/toppings/algaNori.webp";
import cocoTostado from "../assets/toppings/cocoTostado.webp";
import furikake from "../assets/toppings/furikake.webp";
import onions from "../assets/toppings/onions.webp";
import pimientaRoja from "../assets/toppings/pimientaRoja.webp";
import pumpkingSeeds from "../assets/toppings/pumpkingSeeds.webp";
import rabanos from "../assets/toppings/rabanos.webp";

const MAX_TOPPINGS = 5;

const ToppingsSelection = ({ onNext }) => {
  const { order, updateOrder } = useOrder();

  const toppings = [
    { id: "sesame_seeds", name: "Sesame Seeds (Ajonjolí)", image: ajonjoli },
    {
      id: "crispy_onions",
      name: "Crispy Onions (Cebolla Crujiente)",
      image: onions,
    },
    {
      id: "nori_strips",
      name: "Nori Strips (Tiras de Alga Nori)",
      image: algaNori,
    },
    {
      id: "red_pepper_flakes",
      name: "Red Pepper Flakes (Pimienta Roja en Polvo)",
      image: pimientaRoja,
    },
    {
      id: "pickled_radish",
      name: "Pickled Radish (Rábano Encurtido)",
      image: rabanos,
    },
    {
      id: "toasted_coconut",
      name: "Toasted Coconut Flakes (Copos de Coco Tostado)",
      image: cocoTostado,
    },
    {
      id: "pumpkin_seeds",
      name: "Pumpkin Seeds (Pepitas)",
      image: pumpkingSeeds,
    },
    { id: "furikake", name: "Furikake (Furikake)", image: furikake },
  ];

  const [selectedToppings, setSelectedToppings] = useState(
    order.toppings || []
  );

  const toggleTopping = (toppingId) => {
    setSelectedToppings((prev) => {
      // remove
      if (prev.includes(toppingId)) {
        const updated = prev.filter((id) => id !== toppingId);
        updateOrder("toppings", updated);
        return updated;
      }

      // add (limit)
      if (prev.length >= MAX_TOPPINGS) {
        alert(`You can select up to ${MAX_TOPPINGS} toppings.`);
        return prev;
      }

      const updated = [...prev, toppingId];
      updateOrder("toppings", updated);
      return updated;
    });
  };

  const handleNext = () => {
    if (selectedToppings.length > 0) onNext({ toppings: selectedToppings });
    else alert("Please select at least one topping before proceeding!");
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>Step 6 of 6</div>
        <h2 className={styles.title}>Choose your toppings</h2>
        <p className={styles.subtitle}>
          Finish with crunch + texture. Choose up to {MAX_TOPPINGS}.
        </p>
      </div>

      <div className={styles.grid}>
        {toppings.map((topping) => (
          <button
            key={topping.id}
            type="button"
            className={`${styles.card} ${
              selectedToppings.includes(topping.id) ? styles.selected : ""
            }`}
            onClick={() => toggleTopping(topping.id)}
          >
            <div className={styles.imageWrap}>
              <img
                src={topping.image}
                alt={topping.name}
                className={styles.image}
                loading="lazy"
              />
              <div className={styles.imageOverlay} />
            </div>

            <p className={styles.name}>{topping.name}</p>
          </button>
        ))}
      </div>

      <div className={styles.actions}>
        <span className={styles.helper}>
          Selected {selectedToppings.length} / {MAX_TOPPINGS}
        </span>

        <button className={styles.nextButton} onClick={handleNext}>
          Next
        </button>
      </div>
    </div>
  );
};

export default ToppingsSelection;
