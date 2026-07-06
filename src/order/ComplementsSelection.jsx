import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import { getItemLabel } from "./OrderLabels";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./ComplementsSelection.module.css";

import aguacate from "../assets/complements/aguacate.webp";
import algas from "../assets/complements/algas.webp";
import chia from "../assets/complements/chia.webp";
import chicharos from "../assets/complements/chicharos.webp";
import colRizado from "../assets/complements/colRizado.webp";
import edamames from "../assets/complements/edamames.webp";
import jicama from "../assets/complements/jicama.webp";
import maiz from "../assets/complements/maiz.webp";
import mango from "../assets/complements/mango.webp";
import pepino from "../assets/complements/pepino.webp";
import pina from "../assets/complements/pina.webp";
import zanahoria from "../assets/complements/zanahoria.webp";

const MAX_COMPLEMENTS = 6;

const ComplementsSelection = ({ onNext, onBack }) => {
  const { order, updateOrder } = useOrder();
  const { language, t } = useLanguage();

  const complements = [
    { id: "shredded_carrots", image: zanahoria },
    { id: "cucumber", image: pepino },
    { id: "mango", image: mango },
    { id: "jicama", image: jicama },
    { id: "seaweed", image: algas },
    { id: "avocado", image: aguacate },
    { id: "edamame", image: edamames },
    { id: "kale", image: colRizado },
    { id: "peas", image: chicharos },
    { id: "corn", image: maiz },
    { id: "pineapple", image: pina },
    { id: "chia_seeds", image: chia },
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

      if (prev.length >= MAX_COMPLEMENTS) {
        setError(t("order.complementsMaxError", { max: MAX_COMPLEMENTS }));
        return prev;
      }

      setError("");
      const next = [...prev, complementId];
      updateOrder("complements", next);
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
        <div className={styles.badge}>{t("order.step", { step: 4, total: 6 })}</div>
        <h2 className={styles.title}>{t("order.complementsTitle")}</h2>
        <p className={styles.subtitle}>
          {t("order.complementsSubtitle", { max: MAX_COMPLEMENTS })}
        </p>
      </div>

      <div className={styles.grid}>
        {complements.map((complement) => {
          const name = getItemLabel("complement", complement.id, language);
          return (
          <button
            key={complement.id}
            type="button"
            className={`${styles.card} ${
              selectedComplements.includes(complement.id) ? styles.selected : ""
            }`}
            onClick={() => toggleComplement(complement.id)}
          >
            <div className={styles.imageWrap}>
              <img
                src={complement.image}
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
          {selectedComplements.length === 0 && (
            <button className={styles.skipBtn} type="button" onClick={onNext}>
              Omitir
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
