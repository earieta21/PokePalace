import React from "react";
import styles from "./Promotions.module.css";

const Promotions = () => {
  const promotions = [
    {
      id: 1,
      title: "Get 20% Off Your First Order!",
      description: "Use code FIRST20 at checkout.",
      img: "/assets/promo1.jpg",
    },
    {
      id: 2,
      title: "Free Delivery on Orders Over $30",
      description: "Enjoy delicious poke at no extra cost!",
      img: "/assets/promo2.jpg",
    },
  ];

  return (
    <div className={styles.promotions}>
      <h2 className={styles.title}>Promotions</h2>
      <div className={styles.promoGrid}>
        {promotions.map((promo) => (
          <div key={promo.id} className={styles.promoCard}>
            <img
              src={promo.img}
              alt={promo.title}
              className={styles.promoImg}
            />
            <h3>{promo.title}</h3>
            <p>{promo.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Promotions;
