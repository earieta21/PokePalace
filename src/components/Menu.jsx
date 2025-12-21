import React from "react";
import styles from "./Menu.module.css";

const Menu = ({ items = [] }) => {
  return (
    <div className={styles.menuGrid}>
      {items.map((item) => {
        const price = parseFloat(item.price);

        return (
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

              <p className={styles.menuPrice}>
                {!isNaN(price) ? `$${price.toFixed(2)}` : "N/A"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Menu;
