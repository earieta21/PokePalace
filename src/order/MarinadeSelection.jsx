import React, { useEffect, useState } from "react";
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
    {
      id: "citrus_marinade",
      name: "Citrus Marinade (Marinado Cítrico)",
      image: citrico,
    },
    {
      id: "shoyu_marinade",
      name: "Shoyu Marinade (Marinado Shoyu)",
      image: shoyu,
    },
    {
      id: "ponzu_marinade",
      name: "Ponzu Marinade (Marinado Ponzu)",
      image: punzu,
    },
    {
      id: "spicy_marinade",
      name: "Spicy Marinade (Marinado Spicy)",
      image: spicy,
    },
    {
      id: "sesame_marinade",
      name: "Sesame Marinade (Marinado de Sésamo)",
      image: sesame,
    },
    {
      id: "wasabi_marinade",
      name: "Wasabi Marinade (Marinado de Wasabi)",
      image: wassabi,
    },
    {
      id: "miso_marinade",
      name: "Miso Marinade (Marinado de Miso)",
      image: miso,
    },
    {
      id: "garlic_ginger_marinade",
      name: "Garlic Ginger Marinade (Marinado de Ajo y Jengibre)",
      image: garlicGinger,
    },
  ];

  const [selectedMarinades, setSelectedMarinades] = useState(
    order.marinades || []
  );

  useEffect(() => {
    // Guardar en el key correcto: "marinades"
    updateOrder("marinades", selectedMarinades);
  }, [selectedMarinades, updateOrder]);

  const toggleMarinade = (marinadeId) => {
    setSelectedMarinades((prev) => {
      if (prev.includes(marinadeId)) {
        return prev.filter((id) => id !== marinadeId);
      }

      if (prev.length >= MAX_MARINADES) {
        alert(`You can select up to ${MAX_MARINADES} marinades.`);
        return prev;
      }

      return [...prev, marinadeId];
    });
  };

  const handleNext = () => {
    if (selectedMarinades.length > 0) {
      // Pasamos data al step también (consistencia con tu flow)
      onNext({ marinades: selectedMarinades });
    } else {
      alert("Please select at least one marinade before proceeding!");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>Step 3 of 6</div>
        <h2 className={styles.title}>Choose your marinades</h2>
        <p className={styles.subtitle}>
          Add flavor layers to your protein. Choose up to {MAX_MARINADES}.
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

      <div className={styles.actions}>
        <span className={styles.helper}>
          Selected {selectedMarinades.length} / {MAX_MARINADES}
        </span>

        <button className={styles.nextButton} onClick={handleNext}>
          Next
        </button>
      </div>
    </div>
  );
};

export default MarinadeSelection;
