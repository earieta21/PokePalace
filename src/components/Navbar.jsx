import React from "react";
import { NavLink } from "react-router-dom";
import {
  FaHome,
  FaShoppingCart,
  FaGift,
  FaCoins,
  FaEllipsisH,
} from "react-icons/fa";
import styles from "./Navbar.module.css";

const Navbar = () => {
  return (
    <nav className={styles.navbar}>
      <NavLink
        to="/"
        className={({ isActive }) =>
          `${styles.link} ${isActive ? styles.active : ""}`
        }
      >
        <span className={styles.iconWrap}>
          <FaHome className={styles.icon} />
        </span>
        <span className={styles.label}>Home</span>
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
        <span className={styles.label}>Order</span>
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
        <span className={styles.label}>Rewards</span>
      </NavLink>

      <NavLink
        to="/earn-points"
        className={({ isActive }) =>
          `${styles.link} ${isActive ? styles.active : ""}`
        }
      >
        <span className={styles.iconWrap}>
          <FaCoins className={styles.icon} />
        </span>
        <span className={styles.label}>Points</span>
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
        <span className={styles.label}>More</span>
      </NavLink>
    </nav>
  );
};

export default Navbar;
