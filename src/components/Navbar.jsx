import React from "react";
import { NavLink } from "react-router-dom";
import {
  FaHome,
  FaShoppingCart,
  FaGift,
  FaEllipsisH,
} from "react-icons/fa";
import styles from "./Navbar.module.css";

const Navbar = () => {
  return (
    <nav className={styles.navbar}>
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
        <span className={styles.label}>Inicio</span>
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
        <span className={styles.label}>Ordenar</span>
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
        <span className={styles.label}>Premios</span>
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
        <span className={styles.label}>Más</span>
      </NavLink>
    </nav>
  );
};

export default Navbar;
