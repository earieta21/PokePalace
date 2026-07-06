import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import { getItemLabel } from "./OrderLabels";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./BaseSelection.module.css";
import { useAvailability } from "../context/AvailabilityContext";

import whiteRice from "../assets/base/whiteRice.webp";
import brownRice from "../assets/base/brownRice.webp";
import quinoa from "../assets/base/quinoa.webp";
import mixedGreens from "../assets/base/mixedGreens.webp";

const BaseSelection = ({ onNext, onBack }) => {
  const { order, updateOrder } = useOrder();
  const { language, t } = useLanguage();
  const { unavailableItems } = useAvailability();

  const bases = [
    { id: "white_rice", image: whiteRice },
    { id: "brown_rice", image: brownRice },
    { id: "quinoa", image: quinoa },
    {
      id: "spring_mix",
      description: language === "es" ? "Arroz con ensalada" : "Rice with greens",
      image: mixedGreens,
    },
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
      setError(t("order.baseError"));
      return;
    }
    onNext();
  };

  return (
    <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.badge}>{t("order.step", { step: 1, total: 6 })}</div>
          <h2 className={styles.title}>{t("order.baseTitle")}</h2>
          <p className={styles.subtitle}>
            {t("order.baseSubtitle")}
          </p>
        </div>

        <div className={styles.grid}>
          {bases.map((base) => {
            const name = getItemLabel("base", base.id, language);
            return (
            <button
              key={base.id}
              type="button"
              className={`${styles.card} ${
                selectedBase === base.id ? styles.selected : ""
              }`}
              onClick={() => !unavailableItems.includes(base.id) && handleSelection(base.id)}
              style={{ position: "relative" }}
            >
              <div className={styles.imageWrap}>
                <img
                  src={base.image}
                  alt=""
                  className={styles.image}
                />
                <div className={styles.imageOverlay} />
              </div>

              <p className={styles.name}>{name}</p>
              {base.description && (
                <p className={styles.description}>{base.description}</p>
              )}
              {unavailableItems.includes(base.id) && (
                <div style={{
                  position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  background: "rgba(0,0,0,0.55)", borderRadius: "inherit", zIndex: 2,
                }}>
                  <span style={{ background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 800, padding: "5px 12px", borderRadius: 999 }}>Agotado</span>
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
            ← Atrás
          </button>
          <button className={styles.nextButton} onClick={handleNext}>
            {t("order.next")}
          </button>
        </div>
      </div>
  );
};

export default BaseSelection;
