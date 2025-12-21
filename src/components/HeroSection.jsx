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
    // si todavía no tienes /menu, cámbialo o quítalo
    navigate("/menu");
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
          Fresh Poke, <span className={styles.accent}>crafted</span> your way.
        </h1>

        <p className={styles.heroSubtitle}>
          Clean ingredients. Bold flavor. A modern vibe inspired by nature.
        </p>

        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={handleOrderNow}>
            Order Now
          </button>

          <button className={styles.secondaryBtn} onClick={handleViewMenu}>
            View Menu
          </button>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <p className={styles.statValue}>Premium</p>
            <p className={styles.statLabel}>Quality ingredients</p>
          </div>

          <div className={styles.divider} />

          <div className={styles.stat}>
            <p className={styles.statValue}>Fast</p>
            <p className={styles.statLabel}>Smooth ordering</p>
          </div>

          <div className={styles.divider} />

          <div className={styles.stat}>
            <p className={styles.statValue}>Custom</p>
            <p className={styles.statLabel}>Build your bowl</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
