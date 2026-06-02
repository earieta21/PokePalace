import React, { useState } from "react";
import { useOrder } from "./OrderContext";
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

const SauceSelection = ({ onNext }) => {
  const { order, updateOrder } = useOrder();

  const sauces = [
    { id: "spicy_mayo",          name: "Mayonesa Picante",             image: spicyMayo },
    { id: "soy_sauce",           name: "Salsa de Soja",                image: soya },
    { id: "ponzu_sauce",         name: "Salsa Ponzu",                  image: punzu },
    { id: "sesame_ginger",       name: "Aderezo de Sésamo y Jengibre", image: sesameGinger },
    { id: "wasabi_vinaigrette",  name: "Vinagreta de Wasabi",          image: wasabi },
    { id: "sweet_chili",         name: "Salsa de Chile Dulce",         image: sweetChili },
    { id: "garlic_sriracha",     name: "Salsa de Ajo y Sriracha",      image: garlicSiracha },
    { id: "avocado_lime",        name: "Aderezo de Aguacate y Lima",   image: avocadoLime },
    { id: "miso_dressing",       name: "Aderezo de Miso",              image: miso },
    { id: "yuzu_kosho",          name: "Salsa Yuzu Kosho",             image: yuzuKosho },
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
        setError(`Solo puedes elegir hasta ${MAX_SAUCES} salsas.`);
        return prev;
      }

      setError("");
      const next = [...prev, sauceId];
      updateOrder("sauces", next);
      return next;
    });
  };

  const handleNext = () => {
    if (selectedSauces.length === 0) {
      setError("Selecciona al menos una salsa para continuar.");
      return;
    }
    setError("");
    onNext();
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>Paso 5 de 6</div>
        <h2 className={styles.title}>Elige tus salsas</h2>
        <p className={styles.subtitle}>
          Picante, dulce y umami en perfecta armonía. Elige hasta {MAX_SAUCES}.
        </p>
      </div>

      <div className={styles.grid}>
        {sauces.map((sauce) => (
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
                alt={sauce.name}
                className={styles.image}
                loading="lazy"
              />
              <div className={styles.imageOverlay} />
            </div>

            <p className={styles.name}>{sauce.name}</p>
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
          Seleccionadas {selectedSauces.length} / {MAX_SAUCES}
        </span>

        <button className={styles.nextButton} onClick={handleNext}>
          Siguiente
        </button>
      </div>
    </div>
  );
};

export default SauceSelection;
