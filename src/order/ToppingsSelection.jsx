import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import { getItemLabel } from "./OrderLabels";
import { useLanguage } from "../i18n/LanguageContext";
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
  const { language, t } = useLanguage();

  const toppings = [
    { id: "sesame_seeds", image: ajonjoli },
    { id: "crispy_onions", image: onions },
    { id: "nori_strips", image: algaNori },
    { id: "red_pepper_flakes", image: pimientaRoja },
    { id: "pickled_radish", image: rabanos },
    { id: "toasted_coconut", image: cocoTostado },
    { id: "pumpkin_seeds", image: pumpkingSeeds },
    { id: "furikake", image: furikake },
  ];

  const [selectedToppings, setSelectedToppings] = useState(
    order.toppings || []
  );
  const [error, setError] = useState("");

  const toggleTopping = (toppingId) => {
    setSelectedToppings((prev) => {
      if (prev.includes(toppingId)) {
        const next = prev.filter((id) => id !== toppingId);
        updateOrder("toppings", next);
        return next;
      }

      if (prev.length >= MAX_TOPPINGS) {
        setError(t("order.toppingsMaxError", { max: MAX_TOPPINGS }));
        return prev;
      }

      setError("");
      const next = [...prev, toppingId];
      updateOrder("toppings", next);
      return next;
    });
  };

  const handleNext = () => {
    if (selectedToppings.length === 0) {
      setError(t("order.toppingsMinError"));
      return;
    }
    setError("");
    onNext();
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>{t("order.step", { step: 6, total: 6 })}</div>
        <h2 className={styles.title}>{t("order.toppingsTitle")}</h2>
        <p className={styles.subtitle}>
          {t("order.toppingsSubtitle", { max: MAX_TOPPINGS })}
        </p>
      </div>

      <div className={styles.grid}>
        {toppings.map((topping) => {
          const name = getItemLabel("topping", topping.id, language);
          return (
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
                alt=""
                className={styles.image}
                loading="lazy"
              />
              <div className={styles.imageOverlay} />
            </div>

            <p className={styles.name}>{name}</p>
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
        <span className={styles.helper}>
          {t("order.selected")} {selectedToppings.length} / {MAX_TOPPINGS}
        </span>

        <button className={styles.nextButton} onClick={handleNext}>
          {t("order.next")}
        </button>
      </div>
    </div>
  );
};

export default ToppingsSelection;
