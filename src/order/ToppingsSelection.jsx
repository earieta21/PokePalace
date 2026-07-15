import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import { getItemDescription, getItemLabel } from "./OrderLabels";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./ToppingsSelection.module.css";
import { useAvailability } from "../context/AvailabilityContext";

import ajonjoli from "../assets/toppings/ajonjoli.webp";
import algaNori from "../assets/toppings/algaNori.webp";
import cocoTostado from "../assets/toppings/cocoTostado.webp";
import furikake from "../assets/toppings/furikake.webp";
import onions from "../assets/toppings/onions.webp";
import pimientaRoja from "../assets/toppings/pimientaRoja.webp";
import pumpkingSeeds from "../assets/toppings/pumpkingSeeds.webp";
import rabanos from "../assets/toppings/rabanos.webp";

const MAX_TOPPINGS = 5;

const ToppingsSelection = ({ onNext, onBack }) => {
  const { order, updateOrder } = useOrder();
  const { language, t } = useLanguage();
  const { unavailableItems } = useAvailability();

  const toppings = [
    { id: "sesame_seeds",      image: ajonjoli },
    { id: "crispy_onions",     image: onions },
    { id: "nori_strips",       image: algaNori },
    { id: "red_pepper_flakes", image: pimientaRoja },
    { id: "pickled_radish",    image: rabanos },
    { id: "toasted_coconut",   image: cocoTostado },
    { id: "pumpkin_seeds",     image: pumpkingSeeds },
    { id: "furikake",          image: furikake },
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
          const description = getItemDescription("topping", topping.id, language);
          const isSelected = selectedToppings.includes(topping.id);
          const isUnavailable = unavailableItems.includes(topping.id);
          const isSelectionBlocked = isUnavailable && !isSelected;
          return (
          <button
            key={topping.id}
            type="button"
            style={{ position: "relative" }}
            className={`${styles.card} ${
              isSelected ? styles.selected : ""
            }`}
            onClick={() => !isSelectionBlocked && toggleTopping(topping.id)}
            aria-pressed={isSelected}
            aria-disabled={isSelectionBlocked}
            disabled={isSelectionBlocked}
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
            {description && <p className={styles.itemDesc}>{description}</p>}
            {isUnavailable && (
              <div style={{
                position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,0.55)", borderRadius: "inherit", zIndex: 2,
              }}>
                <span style={{ background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 800, padding: "5px 12px", borderRadius: 999 }}>{t("order.soldOut")}</span>
              </div>
            )}
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
        <button className={styles.backButton} type="button" onClick={onBack}>
          ← {t("order.back")}
        </button>
        <div className={styles.rightActions}>
          {selectedToppings.length === 0 && (
            <button className={styles.skipBtn} type="button" onClick={onNext}>
              {t("order.skip")}
            </button>
          )}
          <button className={styles.nextButton} onClick={handleNext}>
            {t("order.next")} {selectedToppings.length > 0 ? `(${selectedToppings.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ToppingsSelection;
