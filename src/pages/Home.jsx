import React from "react";
import { useNavigate } from "react-router-dom";
import HeroSection from "../components/HeroSection";
import Menu from "../components/Menu";
import { computeBowlSubtotal } from "../order/pricing";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./Home.module.css";

// Usa imágenes reales tuyas si las tienes
import bowl1 from "../assets/poke.webp";
import bowl2 from "../assets/poke.webp";
import bowl3 from "../assets/poke.webp";
import bowl4 from "../assets/poke.webp";

const Home = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const menuItems = [
    {
      id: "signature_emerald",
      name: t("menu.emeraldSalmon"),
      price: computeBowlSubtotal("normal"),
      image: bowl1,
    },
    {
      id: "spicy_tuna_crunch",
      name: t("menu.spicyTuna"),
      price: computeBowlSubtotal("normal"),
      image: bowl2,
    },
    {
      id: "tropical_shrimp",
      name: t("menu.tropicalShrimp"),
      price: computeBowlSubtotal("large"),
      image: bowl3,
    },
    {
      id: "zen_greens",
      name: t("menu.zenGreens"),
      price: computeBowlSubtotal("normal"),
      image: bowl4,
    },
  ];

  return (
    <div className={styles.home}>
      {/* Background decor */}
      <div className={styles.bgGlow} />
      <div className={styles.bgNoise} />

      {/* Hero Section */}
      <section className={styles.section}>
        <HeroSection />
      </section>

      {/* Popular Bowls */}
      <section className={styles.section}>
        <h2 className={styles.title}>{t("home.popularTitle")}</h2>
        <p className={styles.subtitle}>{t("home.popularSubtitle")}</p>

        <Menu items={menuItems} />

        <div className={styles.menuCtaRow}>
          <button
            className={styles.primaryBtn}
            onClick={() => navigate("/order")}
          >
            {t("home.buildBowl")}
          </button>
          <button
            className={styles.secondaryBtn}
            onClick={() => navigate("/order")}
          >
            {t("home.specialBowls")}
          </button>
        </div>
      </section>
    </div>
  );
};

export default Home;
