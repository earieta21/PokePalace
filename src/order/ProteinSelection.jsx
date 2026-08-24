import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import { LARGE_BOWL_UPCHARGE, EXTRA_SCOOP_PRICE, EXTRA_SCOOP_MAX } from "./pricing";
import { getItemLabel } from "./OrderLabels";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./ProteinSelection.module.css";
import { useAvailability } from "../context/AvailabilityContext";

import tuna from "../assets/protein/tuna.webp";
import salmon from "../assets/protein/salmon.webp";
import shrimp from "../assets/protein/shrimp.webp";
import tofu from "../assets/protein/tofu.jpg";

const ProteinSelection = ({ onNext, onBack }) => {
  const { order, updateOrder } = useOrder();
  const { language, t } = useLanguage();
  const { unavailableItems } = useAvailability();
  const MIN_PROTEINS = 1;
  const MAX_PROTEINS = 3;

  const proteins = [
    { id: "tuna", image: tuna },
    { id: "salmon", image: salmon },
    { id: "shrimp", image: shrimp },
    { id: "tofu", image: tofu },
  ];

  const [selectedProteins, setSelectedProteins] = useState(() => {
    if (Array.isArray(order.proteins) && order.proteins.length > 0) return order.proteins;
    return order.protein ? [order.protein] : [];
  });
  const [extraScoops, setExtraScoops] = useState(() =>
    Array.isArray(order.extraScoopProteins) ? order.extraScoopProteins : []
  );
  const [error, setError] = useState("");

  const handleSelection = (proteinId) => {
    setSelectedProteins((prev) => {
      const isRemoving = prev.includes(proteinId);
      const next = isRemoving
        ? prev.filter((id) => id !== proteinId)
        : prev.length < MAX_PROTEINS
          ? [...prev, proteinId]
          : prev;

      if (!isRemoving && prev.length >= MAX_PROTEINS) {
        setError(t("order.proteinMaxError"));
        return prev;
      }

      updateOrder("proteins", next);
      updateOrder("protein", next.join(", "));
      const nextSize = next.length === MAX_PROTEINS ? "large" : "normal";
      updateOrder("bowlSize", nextSize);
      updateOrder("proteinUpcharge", nextSize === "large" ? LARGE_BOWL_UPCHARGE : 0);
      setError("");

      // Un scoop extra solo tiene sentido sobre una proteína ya elegida — si
      // se quita del bowl, cualquier scoop extra pegado a ella se descarta.
      if (isRemoving && extraScoops.includes(proteinId)) {
        const nextScoops = extraScoops.filter((id) => id !== proteinId);
        setExtraScoops(nextScoops);
        updateOrder("extraScoopProteins", nextScoops);
      }

      return next;
    });
  };

  const scoopCountFor = (proteinId) => extraScoops.filter((id) => id === proteinId).length;

  const addScoop = (proteinId) => {
    if (extraScoops.length >= EXTRA_SCOOP_MAX) return;
    const next = [...extraScoops, proteinId];
    setExtraScoops(next);
    updateOrder("extraScoopProteins", next);
  };

  const removeScoop = (proteinId) => {
    const idx = extraScoops.lastIndexOf(proteinId);
    if (idx === -1) return;
    const next = [...extraScoops.slice(0, idx), ...extraScoops.slice(idx + 1)];
    setExtraScoops(next);
    updateOrder("extraScoopProteins", next);
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
        <div className={styles.badge}>{t("order.step", { step: 2, total: 5 })}</div>
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
          const isUnavailable = unavailableItems.includes(protein.id);
          const isSelectionBlocked = isUnavailable && !isSelected;
          const name = getItemLabel("protein", protein.id, language);
          return (
          <button
            key={protein.id}
            type="button"
            className={`${styles.card} ${
              isSelected ? styles.selected : ""
            }`}
            onClick={() => !isSelectionBlocked && handleSelection(protein.id)}
            aria-pressed={isSelected}
            aria-disabled={isSelectionBlocked}
            disabled={isSelectionBlocked}
            style={{ position: "relative" }}
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

      {selectedProteins.length > 0 && (
        <div className={styles.extraScoopSection}>
          <p className={styles.extraScoopTitle}>{t("order.extraScoopTitle")}</p>
          <p className={styles.extraScoopHint}>{t("order.extraScoopHint")}</p>

          <div className={styles.extraScoopList}>
            {selectedProteins.map((proteinId) => {
              const name = getItemLabel("protein", proteinId, language);
              const count = scoopCountFor(proteinId);
              const atMax = extraScoops.length >= EXTRA_SCOOP_MAX;
              return (
                <div key={proteinId} className={styles.extraScoopRow}>
                  <span className={styles.extraScoopName}>{name}</span>
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      onClick={() => removeScoop(proteinId)}
                      disabled={count === 0}
                      aria-label={t("order.extraScoopRemove", { name })}
                    >
                      −
                    </button>
                    <span className={styles.stepperCount} aria-live="polite">{count}</span>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      onClick={() => addScoop(proteinId)}
                      disabled={atMax}
                      aria-label={t("order.extraScoopAdd", { name })}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {extraScoops.length > 0 && (
            <p className={styles.extraScoopTotal}>
              {t("order.extraScoopTotal", {
                count: extraScoops.length,
                price: EXTRA_SCOOP_PRICE,
                total: extraScoops.length * EXTRA_SCOOP_PRICE,
              })}
            </p>
          )}
          {extraScoops.length >= EXTRA_SCOOP_MAX && (
            <p className={styles.extraScoopMaxNotice}>
              {t("order.extraScoopMaxError", { max: EXTRA_SCOOP_MAX })}
            </p>
          )}
        </div>
      )}

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

export default ProteinSelection;
