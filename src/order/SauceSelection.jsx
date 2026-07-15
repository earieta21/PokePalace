import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import { getItemDescription, getItemLabel } from "./OrderLabels";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./SauceSelection.module.css";
import { useAvailability } from "../context/AvailabilityContext";

import avocadoLime from "../assets/dressings/avocadoLime.webp";
import garlicSiracha from "../assets/dressings/garlicSiracha.webp";
import miso from "../assets/dressings/miso.webp";
import punzu from "../assets/dressings/punzu.webp";
import sesameGinger from "../assets/dressings/sesameGinger.webp";
import soya from "../assets/dressings/soya.webp";
import spicyMayo from "../assets/dressings/spicyMayo.webp";
import sweetChili from "../assets/dressings/sweetChili.webp";
import wasabi from "../assets/dressings/wasabi.webp";
import yuzuKosho from "../assets/dressings/yuzuKosho.webp";

const MAX_SAUCES = 2;

const SauceSelection = ({ onNext, onBack }) => {
  const { order, updateOrder } = useOrder();
  const { language, t } = useLanguage();
  const { unavailableItems } = useAvailability();

  const sauces = [
    { id: "spicy_mayo",         image: spicyMayo },
    { id: "soy_sauce",          image: soya },
    { id: "ponzu_sauce",        image: punzu },
    { id: "sesame_ginger",      image: sesameGinger },
    { id: "wasabi_vinaigrette", image: wasabi },
    { id: "sweet_chili",        image: sweetChili },
    { id: "garlic_sriracha",    image: garlicSiracha },
    { id: "avocado_lime",       image: avocadoLime },
    { id: "miso_dressing",      image: miso },
    { id: "yuzu_kosho",         image: yuzuKosho },
  ];

  const [selectedSauces, setSelectedSauces] = useState(order.sauces || []);
  const [error, setError] = useState("");

  const toggleSauce = (sauceId) => {
    setSelectedSauces((prev) => {
      if (prev.includes(sauceId)) {
        const next = prev.filter((id) => id !== sauceId);
        updateOrder("sauces", next);
        return next;
      }

      if (prev.length >= MAX_SAUCES) {
        setError(t("order.sauceMaxError", { max: MAX_SAUCES }));
        return prev;
      }

      setError("");
      const next = [...prev, sauceId];
      updateOrder("sauces", next);
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
        <div className={styles.badge}>{t("order.step", { step: 5, total: 6 })}</div>
        <h2 className={styles.title}>{t("order.sauceTitle")}</h2>
        <p className={styles.subtitle}>
          {t("order.sauceSubtitle", { max: MAX_SAUCES })}
        </p>
      </div>

      <div className={styles.grid}>
        {sauces.map((sauce) => {
          const name = getItemLabel("sauce", sauce.id, language);
          const description = getItemDescription("sauce", sauce.id, language);
          const isSelected = selectedSauces.includes(sauce.id);
          const isUnavailable = unavailableItems.includes(sauce.id);
          const isSelectionBlocked = isUnavailable && !isSelected;
          return (
          <button
            key={sauce.id}
            type="button"
            style={{ position: "relative" }}
            className={`${styles.card} ${
              isSelected ? styles.selected : ""
            }`}
            onClick={() => !isSelectionBlocked && toggleSauce(sauce.id)}
            aria-pressed={isSelected}
            aria-disabled={isSelectionBlocked}
            disabled={isSelectionBlocked}
          >
            <div className={styles.imageWrap}>
              <img
                src={sauce.image}
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
          {selectedSauces.length === 0 && (
            <button className={styles.skipBtn} type="button" onClick={onNext}>
              {t("order.skip")}
            </button>
          )}
          <button className={styles.nextButton} onClick={handleNext}>
            {t("order.next")} {selectedSauces.length > 0 ? `(${selectedSauces.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SauceSelection;
