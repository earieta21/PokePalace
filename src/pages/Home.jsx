import React from "react";
import { useNavigate } from "react-router-dom";
import HeroSection from "../components/HeroSection";
import Menu from "../components/Menu";
import styles from "./Home.module.css";

// Usa imágenes reales tuyas si las tienes
import bowl1 from "../assets/poke.webp";
import bowl2 from "../assets/poke.webp";
import bowl3 from "../assets/poke.webp";
import bowl4 from "../assets/poke.webp";

const Home = () => {
  const navigate = useNavigate();

  const menuItems = [
    {
      id: "signature_emerald",
      name: "Emerald Salmon Bowl",
      price: "12.99",
      image: bowl1,
    },
    {
      id: "spicy_tuna_crunch",
      name: "Spicy Tuna Crunch",
      price: "13.49",
      image: bowl2,
    },
    {
      id: "tropical_shrimp",
      name: "Tropical Shrimp Bowl",
      price: "13.99",
      image: bowl3,
    },
    {
      id: "zen_greens",
      name: "Zen Greens Bowl",
      price: "11.99",
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
        <h2 className={styles.title}>Popular Bowls</h2>
        <p className={styles.subtitle}>Signature picks + customer favorites.</p>

        <Menu items={menuItems} />

        <div className={styles.menuCtaRow}>
          <button
            className={styles.primaryBtn}
            onClick={() => navigate("/order")}
          >
            Build Your Bowl
          </button>
          <button
            className={styles.secondaryBtn}
            onClick={() => navigate("/order")}
          >
            Order Signature
          </button>
        </div>
      </section>
    </div>
  );
};

export default Home;
