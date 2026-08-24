import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeroSection from "../components/HeroSection";
import Menu from "../components/Menu";
import { computeBowlSubtotal } from "../order/pricing";
import { useLanguage } from "../i18n/LanguageContext";
import { useOrder } from "../order/OrderContext";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../config";
import styles from "./Home.module.css";

import theOg from "../assets/menu/theOg.webp";
import skinnyBowl from "../assets/menu/skinnyBowl.webp";
import quinoaBowl from "../assets/menu/quinoaBowl.webp";

const Home = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { addCatalogItem, reorder } = useOrder();
  const { user, isLoggedIn, token } = useContext(AuthContext);

  // Último pedido completado del cliente — si existe, se ofrece "Ordenar de
  // nuevo" para saltarse el armador. Se limpia al cerrar sesión.
  const [lastOrder, setLastOrder] = useState(null);
  useEffect(() => {
    if (!isLoggedIn || !token) {
      setLastOrder(null);
      return undefined;
    }
    let cancelled = false;
    fetch(`${API_URL}/api/orders/mine`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const completed = (data.orders || []).find(
          (o) => o.status === "completed" && (o.base || o.cartItems?.length > 0)
        );
        setLastOrder(completed || null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isLoggedIn, token]);

  const handleReorder = () => {
    if (!lastOrder) return;
    reorder(lastOrder);
    navigate("/summary");
  };

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

      {/* Bienvenida + ordenar de nuevo, solo para clientes logueados */}
      {isLoggedIn && (
        <section className={styles.section}>
          <div className={styles.welcomeCard}>
            <div>
              <p className={styles.welcomeGreeting}>
                {t("home.welcomeBack", { name: user?.name || "" })}
              </p>
              {lastOrder && (
                <p className={styles.welcomeSub}>{t("home.reorderHint")}</p>
              )}
            </div>
            {lastOrder && (
              <button className={styles.primaryBtn} onClick={handleReorder}>
                🔄 {t("home.reorderCta")}
              </button>
            )}
          </div>
        </section>
      )}

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
