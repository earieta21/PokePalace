import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import { getItemLabel } from "./OrderLabels";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./ComplementsSelection.module.css";
import { useAvailability } from "../context/AvailabilityContext";
import { COMPLEMENT_FREE_LIMIT, EXTRA_COMPLEMENT_PRICE } from "./pricing";

import aguacate from "../assets/complements/aguacate.webp";
import algas from "../assets/complements/algas.webp";
import edamames from "../assets/complements/edamames.webp";
import pepino from "../assets/complements/pepino.webp";
import pina from "../assets/complements/pina.webp";
import zanahoria from "../assets/complements/zanahoria.webp";
import beet from "../assets/complements/beet.jpg";
import redOnion from "../assets/complements/redOnion.jpg";
import spicySurimi from "../assets/complements/spicySurimi.jpg";
import surimi from "../assets/complements/surimi.jpg";

// Los primeros COMPLEMENT_FREE_LIMIT van incluidos en el precio del bowl;
// de ahí en adelante cada complemento cuesta EXTRA_COMPLEMENT_PRICE. El
// único tope real es el tamaño del catálogo visible (ver `complements` abajo).

const ComplementsSelection = ({ onNext, onBack }) => {
  const { order, updateOrder } = useOrder();
  const { language, t } = useLanguage();
  const { unavailableItems } = useAvailability();

  const complements = [
    { id: "shredded_carrots", image: zanahoria },
    { id: "seaweed", image: algas },
    { id: "edamame", image: edamames },
    { id: "red_onion", image: redOnion },
    { id: "cucumber", image: pepino },
    { id: "pineapple", image: pina },
    { id: "beet", image: beet },
    { id: "surimi", image: surimi },
    { id: "spicy_surimi", image: spicySurimi },
    { id: "avocado", image: aguacate },
  ];

  const [selectedComplements, setSelectedComplements] = useState(
    order.complements || []
  );
  const [error, setError] = useState("");

  const toggleComplement = (complementId) => {
    setSelectedComplements((prev) => {
      if (prev.includes(complementId)) {
        const next = prev.filter((id) => id !== complementId);
        updateOrder("complements", next);
        return next;
      }

      if (prev.length >= complements.length) {
        setError(t("order.complementsMaxError", { max: complements.length }));
        return prev;
      }

      setError("");
      const next = [...prev, complementId];
      updateOrder("complements", next);
      return next;
    });
  };

  const extraCount = Math.max(0, selectedComplements.length - COMPLEMENT_FREE_LIMIT);

  const handleNext = () => {
    setError("");
    onNext();
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>{t("order.step", { step: 3, total: 5 })}</div>
        <h2 className={styles.title}>{t("order.complementsTitle")}</h2>
        <p className={styles.subtitle}>
          {t("order.complementsSubtitle", { free: COMPLEMENT_FREE_LIMIT, price: EXTRA_COMPLEMENT_PRICE })}
        </p>
        {extraCount > 0 && (
          <p className={styles.subtitle} style={{ fontWeight: 700 }}>
            +{extraCount} extra × ${EXTRA_COMPLEMENT_PRICE} = ${extraCount * EXTRA_COMPLEMENT_PRICE} MXN
          </p>
        )}
      </div>

      <div className={styles.grid}>
        {complements.map((complement) => {
          const name = getItemLabel("complement", complement.id, language);
          const selectedIndex = selectedComplements.indexOf(complement.id);
          const isSelected = selectedIndex >= 0;
          const isExtra = isSelected && selectedIndex >= COMPLEMENT_FREE_LIMIT;
          const isUnavailable = unavailableItems.includes(complement.id);
          const isSelectionBlocked = isUnavailable && !isSelected;
          return (
          <button
            key={complement.id}
            type="button"
            style={{ position: "relative" }}
            className={`${styles.card} ${
              isSelected ? styles.selected : ""
            }`}
            onClick={() => !isSelectionBlocked && toggleComplement(complement.id)}
            aria-pressed={isSelected}
            aria-disabled={isSelectionBlocked}
            disabled={isSelectionBlocked}
          >
            <div className={styles.imageWrap}>
              <img
                src={complement.image}
                alt=""
                className={styles.image}
                loading="lazy"
              />
              <div className={styles.imageOverlay} />
              {isExtra && (
                <span style={{
                  position: "absolute", top: 6, right: 6,
                  background: "#b45309", color: "#fff", fontSize: 10, fontWeight: 800,
                  padding: "2px 7px", borderRadius: 999, zIndex: 2,
                }}>
                  +${EXTRA_COMPLEMENT_PRICE}
                </span>
              )}
            </div>
            <p className={styles.name}>{name}</p>
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
          {selectedComplements.length === 0 && (
            <button className={styles.skipBtn} type="button" onClick={onNext}>
              {t("order.skip")}
            </button>
          )}
          <button className={styles.nextButton} onClick={handleNext}>
            {t("order.next")} {selectedComplements.length > 0 ? `(${selectedComplements.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComplementsSelection;
