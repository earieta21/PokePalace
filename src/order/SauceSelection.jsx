import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import { getItemLabel } from "./OrderLabels";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./SauceSelection.module.css";

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

  const sauces = [
    { id: "spicy_mayo", image: spicyMayo },
    { id: "soy_sauce", image: soya },
    { id: "ponzu_sauce", image: punzu },
    { id: "sesame_ginger", image: sesameGinger },
    { id: "wasabi_vinaigrette", image: wasabi },
    { id: "sweet_chili", image: sweetChili },
    { id: "garlic_sriracha", image: garlicSiracha },
    { id: "avocado_lime", image: avocadoLime },
    { id: "miso_dressing", image: miso },
    { id: "yuzu_kosho", image: yuzuKosho },
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
          return (
          <button
            key={sauce.id}
            type="button"
            className={`${styles.card} ${
              selectedSauces.includes(sauce.id) ? styles.selected : ""
            }`}
            onClick={() => toggleSauce(sauce.id)}
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
        <div className={styles.rightActions}>
          {selectedSauces.length === 0 && (
            <button className={styles.skipBtn} type="button" onClick={onNext}>
              Omitir
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
