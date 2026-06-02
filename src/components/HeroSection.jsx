import React from "react";
import styles from "./HeroSection.module.css";
import pokebowl from "../assets/poke.webp";
import { useNavigate } from "react-router-dom";

const HeroSection = () => {
  const navigate = useNavigate();

  const handleOrderNow = () => {
    navigate("/order");
  };

  const handleViewMenu = () => {
    navigate("/order");
  };

  return (
    <section className={styles.hero}>
      <div className={styles.media}>
        <img
          src={pokebowl}
          alt="Fresh Poke Bowls"
          className={styles.heroImage}
        />
        <div className={styles.overlay} />
      </div>

      <div className={styles.content}>
        <div className={styles.badge}>Urban Jungle • Natural Modern</div>

        <h1 className={styles.heroTitle}>
          Poke fresco, <span className={styles.accent}>hecho</span> a tu gusto.
        </h1>

        <p className={styles.heroSubtitle}>
          Ingredientes frescos. Sabor intenso. Una experiencia moderna inspirada en la naturaleza.
        </p>

        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={handleOrderNow}>
            Ordenar Ahora
          </button>

          <button className={styles.secondaryBtn} onClick={handleViewMenu}>
            Ver Menú
          </button>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <p className={styles.statValue}>Premium</p>
            <p className={styles.statLabel}>Ingredientes de calidad</p>
          </div>

          <div className={styles.divider} />

          <div className={styles.stat}>
            <p className={styles.statValue}>Rápido</p>
            <p className={styles.statLabel}>Pedido sin complicaciones</p>
          </div>

          <div className={styles.divider} />

          <div className={styles.stat}>
            <p className={styles.statValue}>A tu gusto</p>
            <p className={styles.statLabel}>Arma tu bowl</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
