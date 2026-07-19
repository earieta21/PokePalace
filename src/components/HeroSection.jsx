import React from "react";
import styles from "./HeroSection.module.css";
import pokebowl from "../assets/hero-poke-realistic-v2.webp";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";

const HeroSection = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

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
          alt={t("home.heroImageAlt")}
          className={styles.heroImage}
          width="1536"
          height="1024"
          fetchPriority="high"
          decoding="async"
        />
        <div className={styles.overlay} />
      </div>

      <div className={styles.content}>
        <div className={styles.badge}>{t("home.heroBadge")}</div>

        <h1 className={styles.heroTitle}>
          {t("home.heroTitle")}
        </h1>

        <p className={styles.heroSubtitle}>
          {t("home.heroSubtitle")}
        </p>

        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={handleOrderNow}>
            {t("home.orderNow")}
          </button>

          <button className={styles.secondaryBtn} onClick={handleViewMenu}>
            {t("home.viewMenu")}
          </button>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <p className={styles.statValue}>{t("home.statPremium")}</p>
            <p className={styles.statLabel}>{t("home.statPremiumLabel")}</p>
          </div>

          <div className={styles.divider} />

          <div className={styles.stat}>
            <p className={styles.statValue}>{t("home.statFast")}</p>
            <p className={styles.statLabel}>{t("home.statFastLabel")}</p>
          </div>

          <div className={styles.divider} />

          <div className={styles.stat}>
            <p className={styles.statValue}>{t("home.statCustom")}</p>
            <p className={styles.statLabel}>{t("home.statCustomLabel")}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
