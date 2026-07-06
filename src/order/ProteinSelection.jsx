import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import { LARGE_BOWL_UPCHARGE } from "./pricing";
import { getItemLabel } from "./OrderLabels";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./ProteinSelection.module.css";

import tuna from "../assets/protein/tuna.webp";
import salmon from "../assets/protein/salmon.webp";
import shrimp from "../assets/protein/shrimp.webp";
import octopus from "../assets/protein/octopus.webp";
import searedTuna from "../assets/protein/searedTuna.webp";

const ProteinSelection = ({ onNext, onBack }) => {
  const { order, updateOrder } = useOrder();
  const { language, t } = useLanguage();
  const MIN_PROTEINS = 2;
  const MAX_PROTEINS = 3;

  const proteins = [
    { id: "tuna", image: tuna },
    { id: "salmon", image: salmon },
    { id: "shrimp", image: shrimp },
    { id: "octopus", image: octopus },
    { id: "seared_tuna", image: searedTuna },
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
        setError(t("order.proteinMaxError"));
        return prev;
      }

      updateOrder("proteins", next);
      updateOrder("protein", next.join(", "));
      const nextSize = next.length === MAX_PROTEINS ? "large" : "normal";
      updateOrder("bowlSize", nextSize);
      updateOrder("proteinUpcharge", nextSize === "large" ? LARGE_BOWL_UPCHARGE : 0);
      setError("");
      return next;
    });
  };

  const handleNext = () => {
    if (selectedProteins.length < MIN_PROTEINS) {
      setError(t("order.proteinMinError"));
      return;
    }
    onNext();
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>{t("order.step", { step: 2, total: 6 })}</div>
        <h2 className={styles.title}>{t("order.proteinTitle")}</h2>
        <p className={styles.subtitle}>
          {t("order.proteinSubtitle")}
        </p>
      </div>

      <div className={styles.selectionInfo}>
        <span>{t("order.proteinCount", { count: selectedProteins.length, max: MAX_PROTEINS })}</span>
        <strong>
          {selectedProteins.length === MAX_PROTEINS
            ? t("order.proteinInfoLarge")
            : t("order.proteinInfoNormal")}
        </strong>
      </div>

      <div className={styles.grid}>
        {proteins.map((protein) => {
          const selectedIndex = selectedProteins.indexOf(protein.id);
          const isSelected = selectedIndex >= 0;
          const name = getItemLabel("protein", protein.id, language);
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
                alt=""
                className={styles.image}
                loading="lazy"
              />
              <div className={styles.imageOverlay} />
              {isSelected && (
                <span className={styles.selectedBadge}>{selectedIndex + 1}</span>
              )}
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

export default ProteinSelection;
