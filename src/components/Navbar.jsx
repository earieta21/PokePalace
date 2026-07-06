import React from "react";
import { NavLink } from "react-router-dom";
import {
  FaHome,
  FaShoppingCart,
  FaGift,
  FaEllipsisH,
} from "react-icons/fa";
import { useLanguage } from "../i18n/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import styles from "./Navbar.module.css";

const Navbar = () => {
  const { language, t, toggleLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className={styles.navbar} aria-label="Main navigation">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `${styles.link} ${isActive ? styles.active : ""}`
        }
      >
        <span className={styles.iconWrap}>
          <FaHome className={styles.icon} />
        </span>
        <span className={styles.label}>{t("nav.home")}</span>
      </NavLink>

      <NavLink
        to="/order"
        className={({ isActive }) =>
          `${styles.link} ${isActive ? styles.active : ""}`
        }
      >
        <span className={styles.iconWrap}>
          <FaShoppingCart className={styles.icon} />
        </span>
        <span className={styles.label}>{t("nav.order")}</span>
      </NavLink>

      <NavLink
        to="/rewards-deals"
        className={({ isActive }) =>
          `${styles.link} ${isActive ? styles.active : ""}`
        }
      >
        <span className={styles.iconWrap}>
          <FaGift className={styles.icon} />
        </span>
        <span className={styles.label}>{t("nav.rewards")}</span>
      </NavLink>

      <NavLink
        to="/more-options"
        className={({ isActive }) =>
          `${styles.link} ${isActive ? styles.active : ""}`
        }
      >
        <span className={styles.iconWrap}>
          <FaEllipsisH className={styles.icon} />
        </span>
        <span className={styles.label}>{t("nav.more")}</span>
      </NavLink>

      <button
        type="button"
        className={styles.themeButton}
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      >
        {theme === "dark" ? "☀" : "🌙"}
      </button>

      <button
        type="button"
        className={styles.languageButton}
        onClick={toggleLanguage}
        aria-label={t("language.label")}
      >
        {language === "es" ? "EN" : "ES"}
      </button>
    </nav>
  );
};

export default Navbar;
