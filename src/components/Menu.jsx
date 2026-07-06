import React from "react";
import styles from "./Menu.module.css";

const formatMenuPrice = (value) => {
  const numericValue =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^0-9.]/g, ""));

  if (!Number.isFinite(numericValue)) return value || "N/A";

  return `$${numericValue.toLocaleString("es-MX")} MXN`;
};

const Menu = ({ items = [] }) => {
  return (
    <div className={styles.menuGrid}>
      {items.map((item) => (
        <div key={item.id} className={styles.menuCard}>
          <div className={styles.imageWrap}>
            <img
              src={item.image}
              alt={item.name}
              className={styles.menuImage}
              loading="lazy"
            />
            <div className={styles.imageOverlay} />
          </div>

          <div className={styles.cardBody}>
            <h3 className={styles.menuName}>{item.name}</h3>

            <p className={styles.menuPrice}>{formatMenuPrice(item.price)}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Menu;
