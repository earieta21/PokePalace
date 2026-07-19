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

const Menu = ({ items = [], onSelect }) => {
  return (
    <div className={styles.menuGrid}>
      {items.map((item) => (
        <button
          key={item.id}
          className={styles.menuCard}
          type="button"
          onClick={() => onSelect?.(item)}
          aria-label={item.name}
        >
          <div className={styles.imageWrap}>
            <img
              src={item.image}
              alt={item.name}
              className={styles.menuImage}
              loading="lazy"
              width="900"
              height="675"
              decoding="async"
            />
            <div className={styles.imageOverlay} />
          </div>

          <div className={styles.cardBody}>
            <h3 className={styles.menuName}>{item.name}</h3>

            <p className={styles.menuPrice}>{formatMenuPrice(item.price)}</p>
          </div>
        </button>
      ))}
    </div>
  );
};

export default Menu;
