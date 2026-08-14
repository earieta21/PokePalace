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

const MAX_BASES = 2;

const BaseSelection = ({ onNext, onBack, isKiosk = false }) => {
  const { order, updateOrder } = useOrder();
  const { language, t } = useLanguage();
  const { unavailableItems } = useAvailability();

  const bases = [
    { id: "white_rice", image: whiteRice },
    { id: "spring_mix", image: mixedGreens },
    { id: "quinoa", image: quinoa },
    { id: "brown_rice", image: brownRice, comingSoon: true },
  ];

  const [selectedBases, setSelectedBases] = useState(() => {
    if (Array.isArray(order.bases) && order.bases.length > 0) return order.bases;
    return order.base ? [order.base] : [];
  });
  const [error, setError] = useState("");

  const handleSelection = (baseId) => {
    setSelectedBases((prev) => {
      const isRemoving = prev.includes(baseId);
      if (!isRemoving && prev.length >= MAX_BASES) {
        setError(t("order.baseMaxError"));
        return prev;
      }
      const next = isRemoving ? prev.filter((id) => id !== baseId) : [...prev, baseId];
      updateOrder("bases", next);
      // `base` se conserva como la primera elegida — así lo que solo lee un
      // valor (favoritos, tickets viejos) sigue funcionando sin cambios.
      updateOrder("base", next[0] || "");
      setError("");
      return next;
    });
  };

  const handleNext = () => {
    if (selectedBases.length < 1) {
      setError(t("order.baseError"));
      return;
    }
    onNext();
  };

  return (
    <div className={`${styles.container} ${isKiosk ? styles.containerKiosk : ""}`}>
        <div className={styles.header}>
          <div className={styles.badge}>{t("order.step", { step: 1, total: 6 })}</div>
          <h2 className={styles.title}>{t("order.baseTitle")}</h2>
          <p className={styles.subtitle}>
            {t("order.baseSubtitle")}
          </p>
        </div>

        <div className={styles.selectionInfo}>
          <span>{t("order.baseHint", { max: MAX_BASES })}</span>
        </div>

        <div className={styles.grid}>
          {bases.map((base) => {
            const name = getItemLabel("base", base.id, language);
            const isSelected = selectedBases.includes(base.id);
            const isUnavailable = base.comingSoon || unavailableItems.includes(base.id);
            const isSelectionBlocked = isUnavailable && !isSelected;
            return (
            <button
              key={base.id}
              type="button"
              className={`${styles.card} ${
                isSelected ? styles.selected : ""
              }`}
              onClick={() => !isSelectionBlocked && handleSelection(base.id)}
              aria-pressed={isSelected}
              aria-disabled={isSelectionBlocked}
              disabled={isSelectionBlocked}
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
              {isUnavailable && (
                <div style={{
                  position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  background: "rgba(0,0,0,0.55)", borderRadius: "inherit", zIndex: 2,
                }}>
                  <span style={{ background: base.comingSoon ? "#4a7a5a" : "#ef4444", color: "#fff", fontSize: 12, fontWeight: 800, padding: "5px 12px", borderRadius: 999 }}>
                    {base.comingSoon ? t("order.comingSoon") : t("order.soldOut")}
                  </span>
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
          <button className={styles.nextButton} onClick={handleNext}>
            {t("order.next")}
          </button>
        </div>
      </div>
  );
};

export default BaseSelection;
