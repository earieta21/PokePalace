import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import { getItemDescription, getItemLabel } from "./OrderLabels";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./MarinadeSelection.module.css";
import { useAvailability } from "../context/AvailabilityContext";

import citrico from "../assets/marinades/citrico.webp";
import garlicGinger from "../assets/marinades/garlicGinger.webp";
import miso from "../assets/marinades/miso.webp";
import punzu from "../assets/marinades/punzu.webp";
import sesame from "../assets/marinades/sesame.webp";
import shoyu from "../assets/marinades/shoyu.webp";
import spicy from "../assets/marinades/spicy.webp";
import wassabi from "../assets/marinades/wassabi.webp";

const MAX_MARINADES = 2;

const MarinadeSelection = ({ onNext, onBack }) => {
  const { order, updateOrder } = useOrder();
  const { language, t } = useLanguage();
  const { unavailableItems } = useAvailability();

  const marinades = [
    { id: "citrus_marinade",        image: citrico },
    { id: "shoyu_marinade",         image: shoyu },
    { id: "ponzu_marinade",         image: punzu },
    { id: "spicy_marinade",         image: spicy },
    { id: "sesame_marinade",        image: sesame },
    { id: "wasabi_marinade",        image: wassabi },
    { id: "miso_marinade",          image: miso },
    { id: "garlic_ginger_marinade", image: garlicGinger },
  ];

  const [selectedMarinades, setSelectedMarinades] = useState(
    order.marinades || []
  );
  const [error, setError] = useState("");

  const toggleMarinade = (marinadeId) => {
    setSelectedMarinades((prev) => {
      if (prev.includes(marinadeId)) {
        const next = prev.filter((id) => id !== marinadeId);
        updateOrder("marinades", next);
        return next;
      }

      if (prev.length >= MAX_MARINADES) {
        setError(t("order.marinadeMaxError", { max: MAX_MARINADES }));
        return prev;
      }

      setError("");
      const next = [...prev, marinadeId];
      updateOrder("marinades", next);
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
        <div className={styles.badge}>{t("order.step", { step: 3, total: 6 })}</div>
        <h2 className={styles.title}>{t("order.marinadeTitle")}</h2>
        <p className={styles.subtitle}>
          {t("order.marinadeSubtitle", { max: MAX_MARINADES })}
        </p>
      </div>

      <div className={styles.grid}>
        {marinades.map((marinade) => {
          const name = getItemLabel("marinade", marinade.id, language);
          const description = getItemDescription("marinade", marinade.id, language);
          const isSelected = selectedMarinades.includes(marinade.id);
          const isUnavailable = unavailableItems.includes(marinade.id);
          const isSelectionBlocked = isUnavailable && !isSelected;
          return (
          <button
            key={marinade.id}
            type="button"
            style={{ position: "relative" }}
            className={`${styles.card} ${
              isSelected ? styles.selected : ""
            }`}
            onClick={() => !isSelectionBlocked && toggleMarinade(marinade.id)}
            aria-pressed={isSelected}
            aria-disabled={isSelectionBlocked}
            disabled={isSelectionBlocked}
          >
            <div className={styles.imageWrap}>
              <img
                src={marinade.image}
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
          {selectedMarinades.length === 0 && (
            <button className={styles.skipBtn} type="button" onClick={onNext}>
              {t("order.skip")}
            </button>
          )}
          <button className={styles.nextButton} onClick={handleNext}>
            {t("order.next")} {selectedMarinades.length > 0 ? `(${selectedMarinades.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarinadeSelection;
