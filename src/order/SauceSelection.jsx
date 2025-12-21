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
    {
      id: "spicy_mayo",
      name: "Spicy Mayo (Mayonesa Picante)",
      image: spicyMayo,
    },
    { id: "soy_sauce", name: "Soy Sauce (Salsa de Soja)", image: soya },
    { id: "ponzu_sauce", name: "Ponzu Sauce (Salsa Ponzu)", image: punzu },
    {
      id: "sesame_ginger",
      name: "Sesame Ginger Dressing (Aderezo de Sésamo y Jengibre)",
      image: sesameGinger,
    },
    {
      id: "wasabi_vinaigrette",
      name: "Wasabi Vinaigrette (Vinagreta de Wasabi)",
      image: wasabi,
    },
    {
      id: "sweet_chili",
      name: "Sweet Chili Sauce (Salsa de Chile Dulce)",
      image: sweetChili,
    },
    {
      id: "garlic_sriracha",
      name: "Garlic Sriracha Sauce (Salsa de Ajo y Sriracha)",
      image: garlicSiracha,
    },
    {
      id: "avocado_lime",
      name: "Avocado Lime Dressing (Aderezo de Aguacate y Lima)",
      image: avocadoLime,
    },
    {
      id: "miso_dressing",
      name: "Miso Dressing (Aderezo de Miso)",
      image: miso,
    },
    {
      id: "yuzu_kosho",
      name: "Yuzu Kosho Sauce (Salsa Yuzu Kosho)",
      image: yuzuKosho,
    },
  ];

  const [selectedSauces, setSelectedSauces] = useState(order.sauces || []);

  const toggleSauce = (sauceId) => {
    setSelectedSauces((prev) => {
      // remove
      if (prev.includes(sauceId)) {
        const updated = prev.filter((id) => id !== sauceId);
        updateOrder("sauces", updated);
        return updated;
      }

      // add (limit)
      if (prev.length >= MAX_SAUCES) {
        alert(`You can select up to ${MAX_SAUCES} sauces.`);
        return prev;
      }

      const updated = [...prev, sauceId];
      updateOrder("sauces", updated);
      return updated;
    });
  };

  const handleNext = () => {
    if (selectedSauces.length > 0) onNext({ sauces: selectedSauces });
    else alert("Please select at least one sauce before proceeding!");
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>Step 5 of 6</div>
        <h2 className={styles.title}>Choose your sauces</h2>
        <p className={styles.subtitle}>
          Balance spicy, sweet, and umami. Choose up to {MAX_SAUCES}.
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

      <div className={styles.actions}>
        <span className={styles.helper}>
          Selected {selectedSauces.length} / {MAX_SAUCES}
        </span>

        <button className={styles.nextButton} onClick={handleNext}>
          Next
        </button>
      </div>
    </div>
  );
};

export default SauceSelection;
