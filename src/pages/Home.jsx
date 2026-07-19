import React from "react";
import { useNavigate } from "react-router-dom";
import HeroSection from "../components/HeroSection";
import Menu from "../components/Menu";
import { computeBowlSubtotal } from "../order/pricing";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./Home.module.css";

import salmonBowl from "../assets/menu-emerald-salmon-v2.webp";
import spicyTuna from "../assets/menu-spicy-tuna-v2.webp";
import tropicalShrimp from "../assets/menu-tropical-shrimp-v2.webp";
import citrusOctopus from "../assets/menu-citrus-octopus-v2.webp";

const Home = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const menuItems = [
    {
      id: "signature_emerald",
      name: t("menu.emeraldSalmon"),
      price: computeBowlSubtotal("normal"),
      image: salmonBowl,
      orderUrl: "/order?preset=classic_salmon",
    },
    {
      id: "spicy_tuna_crunch",
      name: t("menu.spicyTuna"),
      price: computeBowlSubtotal("normal"),
      image: spicyTuna,
      orderUrl: "/order?preset=spicy_tuna",
    },
    {
      id: "tropical_shrimp",
      name: t("menu.tropicalShrimp"),
      price: computeBowlSubtotal("normal"),
      image: tropicalShrimp,
      orderUrl: "/order?preset=tropical_shrimp",
    },
    {
      id: "citrus_octopus",
      name: t("menu.citrusOctopus"),
      price: computeBowlSubtotal("normal"),
      image: citrusOctopus,
      orderUrl: "/order?preset=citrus_octopus",
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

        <Menu items={menuItems} onSelect={(item) => navigate(item.orderUrl)} />

        <div className={styles.menuCtaRow}>
          <button
            className={styles.primaryBtn}
            onClick={() => navigate("/order")}
          >
            {t("home.buildBowl")}
          </button>
          <button
            className={styles.secondaryBtn}
            onClick={() => navigate("/rewards-deals")}
          >
            {t("home.specialBowls")}
          </button>
        </div>
      </section>
    </div>
  );
};

export default Home;
