import React from "react";
import { useOrder } from "./OrderContext";
import { CUSTOMER_CATALOG, CUSTOMER_CATALOG_CATEGORIES } from "../data/customerCatalog";
import buildBowlBg from "../assets/poke.webp";
import styles from "./MenuBrowser.module.css";

const formatPrice = (value) => `$${Number(value).toLocaleString("es-MX")} MXN`;

const CATEGORY_ICONS = {
  Bowls: "🍣",
  Bebidas: "🥤",
  Extras: "🍫",
};

// Pantalla compartida entre la app/sitio web (`src/pages/MenuPage.jsx`) y el
// kiosco (`src/kiosk/KioskMenuPage.jsx`) — mismo carrito (OrderContext), solo
// cambian los destinos de navegación.
const MenuBrowser = ({ onBuildBowl, onGoToCart, isKiosk = false }) => {
  const { order, addCatalogItem, updateCartItemQty, startNewBowl } = useOrder();

  const cartCount = order.cart.reduce((sum, line) => sum + line.qty, 0);
  const cartSubtotal = order.cart.reduce((sum, line) => sum + line.price * line.qty, 0);

  const qtyForCatalogItem = (catalogId) =>
    order.cart.find((l) => l.kind === "item" && l.catalogId === catalogId)?.qty || 0;

  const handleBuildBowl = () => {
    startNewBowl();
    onBuildBowl();
  };

  const handleAdd = (item) => addCatalogItem(item, 1);
  const handleRemove = (item) => {
    const cartLine = order.cart.find((l) => l.kind === "item" && l.catalogId === item.catalogId);
    if (cartLine) updateCartItemQty(cartLine.cartId, cartLine.qty - 1);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Menú</h2>
          <p className={styles.subtitle}>
            Arma tu bowl o agrega lo que quieras — puedes juntar varios bowls y artículos en un solo pedido.
          </p>
        </div>

        <button
          type="button"
          className={`${styles.buildBowlCard} ${isKiosk ? styles.buildBowlCardKiosk : ""}`}
          style={{ backgroundImage: `url(${buildBowlBg})` }}
          onClick={handleBuildBowl}
        >
          <div className={styles.buildBowlOverlay} />
          <span className={styles.buildBowlIcon} aria-hidden="true">🍚</span>
          <span className={styles.buildBowlText}>
            <strong>Arma tu propio bowl</strong>
            <span className={styles.buildBowlHint}>Elige base, proteínas, marinados y más</span>
          </span>
          <span className={styles.buildBowlArrow} aria-hidden="true">→</span>
        </button>

        {CUSTOMER_CATALOG_CATEGORIES.map((category) => {
          const items = CUSTOMER_CATALOG.filter((item) => item.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category} className={styles.section}>
              <h3 className={styles.sectionTitle}>
                <span aria-hidden="true">{CATEGORY_ICONS[category]}</span> {category}
              </h3>
              <div className={styles.grid}>
                {items.map((item) => {
                  const qty = qtyForCatalogItem(item.catalogId);
                  return (
                    <div
                      key={item.catalogId}
                      className={`${styles.card} ${item.image ? styles.cardWithPhoto : styles.cardIconOnly}`}
                    >
                      {item.image ? (
                        <div className={styles.cardPhotoWrap}>
                          <img src={item.image} alt="" className={styles.cardPhoto} loading="lazy" />
                          <div className={styles.cardPhotoOverlay} />
                        </div>
                      ) : (
                        <span className={styles.cardIconBadge} aria-hidden="true">{item.icon}</span>
                      )}

                      <div className={styles.cardBody}>
                        <div className={styles.cardBodyText}>
                          <p className={styles.cardName}>{item.name}</p>
                          <p className={styles.cardPrice}>{formatPrice(item.price)}</p>
                        </div>

                        {qty > 0 ? (
                          <div className={styles.stepper}>
                            <button
                              type="button"
                              className={styles.stepperBtn}
                              onClick={() => handleRemove(item)}
                              aria-label={`Quitar ${item.name}`}
                            >
                              −
                            </button>
                            <span className={styles.stepperCount} aria-live="polite">{qty}</span>
                            <button
                              type="button"
                              className={styles.stepperBtn}
                              onClick={() => handleAdd(item)}
                              aria-label={`Agregar otro ${item.name}`}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button type="button" className={styles.addBtn} onClick={() => handleAdd(item)}>
                            Agregar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {cartCount > 0 && (
        <button type="button" className={styles.cartBar} onClick={onGoToCart}>
          <span className={styles.cartBarCount}>{cartCount} artículo{cartCount === 1 ? "" : "s"}</span>
          <span>Ver carrito — {formatPrice(cartSubtotal)}</span>
        </button>
      )}
    </div>
  );
};

export default MenuBrowser;
