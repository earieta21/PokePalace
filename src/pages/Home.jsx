import React from "react";
import { useNavigate } from "react-router-dom";
import HeroSection from "../components/HeroSection";
import Menu from "../components/Menu";
import { computeBowlSubtotal } from "../order/pricing";
import { useLanguage } from "../i18n/LanguageContext";
import { useOrder } from "../order/OrderContext";
import styles from "./Home.module.css";

import theOg from "../assets/menu/theOg.webp";
import skinnyBowl from "../assets/menu/skinnyBowl.webp";
import quinoaBowl from "../assets/menu/quinoaBowl.webp";

const Home = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { addCatalogItem } = useOrder();

  // Mismos catalogId que usa el POS (backend/config/posCatalog.js) — receta
  // fija, se agregan directo al carrito sin pasar por el armador, igual que
  // cualquier otro bowl de la casa del menú.
  const menuItems = [
    {
      id: "signature_emerald",
      catalogId: "bowl-the-og",
      name: t("menu.emeraldSalmon"),
      price: computeBowlSubtotal("normal"),
      image: theOg,
    },
    {
      id: "spicy_tuna_crunch",
      catalogId: "bowl-skinny",
      name: t("menu.spicyTuna"),
      price: computeBowlSubtotal("normal"),
      image: skinnyBowl,
    },
    {
      id: "tropical_shrimp",
      catalogId: "bowl-quinoa",
      name: t("menu.tropicalShrimp"),
      price: computeBowlSubtotal("normal"),
      image: quinoaBowl,
    },
  ];

  const handleSelectMenuItem = (item) => {
    addCatalogItem({ catalogId: item.catalogId, name: item.name, price: item.price }, 1);
    navigate("/menu");
  };

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

        <Menu items={menuItems} onSelect={handleSelectMenuItem} />

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
