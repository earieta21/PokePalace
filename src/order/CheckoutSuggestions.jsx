import { useState } from "react";
import { useOrder } from "./OrderContext";
import { useAvailability } from "../context/AvailabilityContext";
import { CUSTOMER_CATALOG_BY_ID } from "../data/customerCatalog";
import { useLanguage } from "../i18n/LanguageContext";
import { analyticsItemFromCartLine, trackEvent } from "../utils/analytics";
import { checkoutSuggestionIds } from "./checkoutSuggestionRules";
import styles from "./CheckoutSuggestions.module.css";

const categoryOf = (catalogId) => CUSTOMER_CATALOG_BY_ID[catalogId]?.categoryKey;

// "¿Algo para acompañar?" del resumen: qué se ofrece y cuándo está en
// checkoutSuggestionRules.js. Un toque agrega el artículo; después la tarjeta
// muestra el mismo contador (− 1 +) que las tarjetas del menú.
export default function CheckoutSuggestions({ isKiosk = false }) {
  const { order, addCatalogItem, updateCartItemQty } = useOrder();
  const { unavailableItems, unavailableCatalogItems, hiddenCatalogItems } = useAvailability();
  const { t } = useLanguage();
  const [addedIds, setAddedIds] = useState([]);

  const cart = Array.isArray(order?.cart) ? order.cart : [];
  const isUnavailable = (id) =>
    unavailableItems.includes(id) || unavailableCatalogItems.includes(id) || hiddenCatalogItems.includes(id);
  const suggestions = checkoutSuggestionIds(cart, { categoryOf, isUnavailable, keepIds: addedIds })
    .map((id) => CUSTOMER_CATALOG_BY_ID[id])
    .filter(Boolean);
  if (suggestions.length === 0) return null;

  const lineFor = (item) => cart.find((line) => line.kind === "item" && line.catalogId === item.catalogId);

  const add = (item) => {
    addCatalogItem(item, 1);
    setAddedIds((ids) => (ids.includes(item.catalogId) ? ids : [...ids, item.catalogId]));
    trackEvent("add_to_cart", {
      currency: "MXN",
      value: item.price,
      placement: "checkout_suggestion",
      items: [analyticsItemFromCartLine({
        kind: "item",
        catalogId: item.catalogId,
        name: item.name,
        category: item.categoryKey,
        price: item.price,
        qty: 1,
      })],
    });
  };

  return (
    <section
      className={`${styles.suggestions} ${isKiosk ? styles.kiosk : ""}`}
      aria-labelledby="checkout-suggestions-title"
    >
      <h3 id="checkout-suggestions-title" className={styles.title}>{t("summary.suggestionsTitle")}</h3>
      <ul className={styles.list}>
        {suggestions.map((item) => {
          const line = lineFor(item);
          const qty = line?.qty ?? 0;
          return (
            <li key={item.catalogId} className={`${styles.card} ${qty > 0 ? styles.cardAdded : ""}`}>
              <span className={styles.media} aria-hidden="true">
                {item.image
                  ? <img src={item.image} alt="" className={styles.photo} loading="lazy" />
                  : <span className={styles.icon}>{item.icon}</span>}
              </span>
              <span className={styles.text}>
                <span className={styles.name}>{item.name}</span>
                <span className={styles.price}>+${item.price}</span>
              </span>
              {qty > 0 ? (
                <span className={styles.stepper}>
                  <button
                    type="button"
                    className={styles.stepperBtn}
                    onClick={() => updateCartItemQty(line.cartId, qty - 1)}
                    aria-label={t("summary.suggestionsRemoveOne", { name: item.name })}
                  >
                    −
                  </button>
                  <span className={styles.count} aria-live="polite">{qty}</span>
                  <button
                    type="button"
                    className={styles.stepperBtn}
                    onClick={() => add(item)}
                    aria-label={t("summary.suggestionsAddAnother", { name: item.name })}
                  >
                    +
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.add}
                  onClick={() => add(item)}
                  aria-label={t("summary.suggestionsAddNamed", { name: item.name })}
                >
                  {t("summary.suggestionsAdd")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
