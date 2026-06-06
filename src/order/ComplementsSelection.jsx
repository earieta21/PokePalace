import React, { useState } from "react";
import { useOrder } from "./OrderContext";
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

const ComplementsSelection = ({ onNext }) => {
  const { order, updateOrder } = useOrder();

  const complements = [
    { id: "shredded_carrots", name: "Zanahoria Rallada",  image: zanahoria },
    { id: "cucumber",         name: "Pepino",             image: pepino },
    { id: "mango",            name: "Mango",              image: mango },
    { id: "jicama",           name: "Jícama",             image: jicama },
    { id: "seaweed",          name: "Algas",              image: algas },
    { id: "avocado",          name: "Aguacate",           image: aguacate },
    { id: "edamame",          name: "Edamame",            image: edamames },
    { id: "kale",             name: "Col Rizada",         image: colRizado },
    { id: "peas",             name: "Chícharos",          image: chicharos },
    { id: "corn",             name: "Maíz",               image: maiz },
    { id: "pineapple",        name: "Piña",               image: pina },
    { id: "chia_seeds",       name: "Semillas de Chía",   image: chia },
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
        setError(`Solo puedes elegir hasta ${MAX_COMPLEMENTS} complementos.`);
        return prev;
      }

      setError("");
      const next = [...prev, complementId];
      updateOrder("complements", next);
      return next;
    });
  };

  const handleNext = () => {
    if (selectedComplements.length === 0) {
      setError("Selecciona al menos un complemento para continuar.");
      return;
    }
    setError("");
    onNext();
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>Paso 4 de 6</div>
        <h2 className={styles.title}>Elige tus complementos</h2>
        <p className={styles.subtitle}>
          Agrega textura, dulzura y verdes. Elige hasta {MAX_COMPLEMENTS}.
        </p>
      </div>

      <div className={styles.grid}>
        {complements.map((complement) => (
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
                alt={complement.name}
                className={styles.image}
                loading="lazy"
              />
              <div className={styles.imageOverlay} />
            </div>
            <p className={styles.name}>{complement.name}</p>
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
          Seleccionados {selectedComplements.length} / {MAX_COMPLEMENTS}
        </span>

        <button className={styles.nextButton} onClick={handleNext}>
          Siguiente
        </button>
      </div>
    </div>
  );
};

export default ComplementsSelection;
