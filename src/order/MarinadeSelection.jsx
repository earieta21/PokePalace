import React, { useState } from "react";
import { useOrder } from "./OrderContext";
import styles from "./MarinadeSelection.module.css";

import citrico from "../assets/marinades/citrico.webp";
import garlicGinger from "../assets/marinades/garlicGinger.webp";
import miso from "../assets/marinades/miso.webp";
import punzu from "../assets/marinades/punzu.webp";
import sesame from "../assets/marinades/sesame.webp";
import shoyu from "../assets/marinades/shoyu.webp";
import spicy from "../assets/marinades/spicy.webp";
import wassabi from "../assets/marinades/wassabi.webp";

const MAX_MARINADES = 2;

const MarinadeSelection = ({ onNext }) => {
  const { order, updateOrder } = useOrder();

  const marinades = [
    { id: "citrus_marinade",       name: "Marinado Cítrico",        image: citrico },
    { id: "shoyu_marinade",        name: "Marinado Shoyu",           image: shoyu },
    { id: "ponzu_marinade",        name: "Marinado Ponzu",           image: punzu },
    { id: "spicy_marinade",        name: "Marinado Picante",         image: spicy },
    { id: "sesame_marinade",       name: "Marinado de Sésamo",       image: sesame },
    { id: "wasabi_marinade",       name: "Marinado de Wasabi",       image: wassabi },
    { id: "miso_marinade",         name: "Marinado de Miso",         image: miso },
    { id: "garlic_ginger_marinade",name: "Marinado de Ajo y Jengibre",image: garlicGinger },
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
        setError(`Solo puedes elegir hasta ${MAX_MARINADES} marinados.`);
        return prev;
      }

      setError("");
      const next = [...prev, marinadeId];
      updateOrder("marinades", next);
      return next;
    });
  };

  const handleNext = () => {
    if (selectedMarinades.length === 0) {
      setError("Selecciona al menos un marinado para continuar.");
      return;
    }
    setError("");
    onNext();
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>Paso 3 de 6</div>
        <h2 className={styles.title}>Elige tus marinados</h2>
        <p className={styles.subtitle}>
          Dale sabor a tu proteína. Elige hasta {MAX_MARINADES}.
        </p>
      </div>

      <div className={styles.grid}>
        {marinades.map((marinade) => (
          <button
            key={marinade.id}
            type="button"
            className={`${styles.card} ${
              selectedMarinades.includes(marinade.id) ? styles.selected : ""
            }`}
            onClick={() => toggleMarinade(marinade.id)}
          >
            <div className={styles.imageWrap}>
              <img
                src={marinade.image}
                alt={marinade.name}
                className={styles.image}
                loading="lazy"
              />
              <div className={styles.imageOverlay} />
            </div>

            <p className={styles.name}>{marinade.name}</p>
          </button>
        ))}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <span className={styles.helper}>
          Seleccionados {selectedMarinades.length} / {MAX_MARINADES}
        </span>

        <button className={styles.nextButton} onClick={handleNext}>
          Siguiente
        </button>
      </div>
    </div>
  );
};

export default MarinadeSelection;
