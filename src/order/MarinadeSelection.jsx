import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import { getItemLabel } from "./OrderLabels";
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
    { id: "citrus_marinade",        image: citrico,      desc: "Naranja, limón y aceite de sésamo" },
    { id: "shoyu_marinade",         image: shoyu,        desc: "Salsa de soya japonesa clásica" },
    { id: "ponzu_marinade",         image: punzu,        desc: "Cítrico con soya y dashi" },
    { id: "spicy_marinade",         image: spicy,        desc: "Chile fresco y jengibre picante" },
    { id: "sesame_marinade",        image: sesame,       desc: "Sésamo tostado y aceite de girasol" },
    { id: "wasabi_marinade",        image: wassabi,      desc: "Toque picante suave con jengibre" },
    { id: "miso_marinade",          image: miso,         desc: "Pasta de soya fermentada, umami" },
    { id: "garlic_ginger_marinade", image: garlicGinger, desc: "Ajo fresco y jengibre picado" },
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
          return (
          <button
            key={marinade.id}
            type="button"
            style={{ position: "relative" }}
            className={`${styles.card} ${
              selectedMarinades.includes(marinade.id) ? styles.selected : ""
            }`}
            onClick={() => !unavailableItems.includes(marinade.id) && toggleMarinade(marinade.id)}
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
            {marinade.desc && <p className={styles.itemDesc}>{marinade.desc}</p>}
            {unavailableItems.includes(marinade.id) && (
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
        <div className={styles.rightActions}>
          {selectedMarinades.length === 0 && (
            <button className={styles.skipBtn} type="button" onClick={onNext}>
              Omitir
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
