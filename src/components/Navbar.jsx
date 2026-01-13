//import React from "react";
import React, { useContext } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  FaHome,
  FaShoppingCart,
  FaGift,
  FaCoins,
  FaEllipsisH,
} from "react-icons/fa";
import styles from "./Navbar.module.css";
import { AuthContext } from "../context/AuthContext";

const Navbar = () => {
  const { isLoggedIn, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleAuthClick = () => {
    if (isLoggedIn) {
      navigate("/mi-cuenta");
    } else {
      navigate("/login");
    }
  };

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

      <button
        onClick={handleAuthClick}
        className={styles.link}
        style={{ background: "none", border: "none" }}
      >
        <span className={styles.iconWrap}>
          <FaEllipsisH className={styles.icon} />
        </span>
        <span className={styles.label}>{isLoggedIn ? "Cuenta" : "Login"}</span>
      </button>
    </nav>
  );
};

export default Navbar;
