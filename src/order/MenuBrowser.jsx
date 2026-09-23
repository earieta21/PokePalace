import React, { useEffect, useRef, useState } from "react";
import { useOrder } from "./OrderContext";
import { useAvailability } from "../context/AvailabilityContext";
import {
  CUSTOMER_CATALOG,
  CUSTOMER_CATALOG_BY_ID,
  CUSTOMER_CATALOG_CATEGORIES,
} from "../data/customerCatalog";
import buildBowlBg from "../assets/poke.webp";
import kioskBowlPhoto from "../assets/home/fresh-1200.webp";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { BOWL_BASE_PRICE } from "./pricing";
import styles from "./MenuBrowser.module.css";

const formatPrice = (value) => `$${Number(value).toLocaleString("es-MX")} MXN`;

const CATEGORY_ICONS = {
  Combos: "👑",
  Bowls: "🍣",
  Bebidas: "🥤",
  Extras: "🍫",
};

// Pantalla compartida entre la app/sitio web (`src/pages/MenuPage.jsx`) y el
// kiosco (`src/kiosk/KioskMenuPage.jsx`) — mismo carrito (OrderContext), solo
// cambian los destinos de navegación.
const MenuBrowser = ({
  onBuildBowl,
  onGoToCart,
  isKiosk = false,
  initialComboId = "",
}) => {
  const {
    order,
    hasBowlDraft,
    addCatalogItem,
    addComboToCart,
    updateCartItemQty,
    startNewBowl,
  } = useOrder();
  const { unavailableItems, comboPalaceActive } = useAvailability();
  const [activeCombo, setActiveCombo] = useState(null);
  const [comboSelection, setComboSelection] = useState({
    comboBowlId: "",
    comboDrinkId: "",
    comboRiceCakeId: "",
  });
  const openedInitialCombo = useRef(false);

  // El armador normal ya filtra ingredientes no disponibles al elegir — el
  // picker del combo tiene que hacer lo mismo, si no el cliente puede elegir
  // algo agotado y el pedido se rechaza hasta el final, al confirmar (con un
  // error fácil de no notar), sin ningún aviso en el momento de elegir.
  const availableOptions = (options) =>
    options.filter((o) => !unavailableItems.includes(o.id));

  const defaultComboSelection = (item) => ({
    comboBowlId: availableOptions(item.comboOptions.bowls)[0]?.id || "",
    comboDrinkId: availableOptions(item.comboOptions.drinks)[0]?.id || "",
    comboRiceCakeId: availableOptions(item.comboOptions.riceCakes)[0]?.id || "",
  });

  useEffect(() => {
    if (openedInitialCombo.current || !initialComboId) return;
    // comboPalaceActive nace en null mientras carga la disponibilidad — hay
    // que esperar la respuesta o un enlace viejo abriría el armador en un
    // día en que el combo no corre.
    if (comboPalaceActive !== true) return;
    const item = CUSTOMER_CATALOG_BY_ID[initialComboId];
    if (!item?.isCombo) return;
    openedInitialCombo.current = true;
    setActiveCombo(item);
    setComboSelection(defaultComboSelection(item));
  }, [initialComboId, comboPalaceActive]);

  const cartCount = order.cart.reduce((sum, line) => sum + line.qty, 0);
  const cartSubtotal = order.cart.reduce(
    (sum, line) => sum + line.price * line.qty,
    0,
  );

  const qtyForCatalogItem = (catalogId) =>
    order.cart.find((l) => l.kind === "item" && l.catalogId === catalogId)
      ?.qty || 0;

  const handleBuildBowl = () => {
    // Si hay un bowl a medio armar se continúa donde se quedó: startNewBowl
    // lo borraría junto con el paso guardado, que es justo lo que hacía
    // sentir que volver a entrar era empezar de cero.
    if (!hasBowlDraft) startNewBowl();
    onBuildBowl();
  };

  const handleAdd = (item) => addCatalogItem(item, 1);
  const handleRemove = (item) => {
    const cartLine = order.cart.find(
      (l) => l.kind === "item" && l.catalogId === item.catalogId,
    );
    if (cartLine) updateCartItemQty(cartLine.cartId, cartLine.qty - 1);
  };

  const openComboPicker = (item) => {
    setActiveCombo(item);
    setComboSelection(defaultComboSelection(item));
  };

  const closeComboPicker = () => setActiveCombo(null);

  const confirmCombo = () => {
    if (!activeCombo) return;
    addComboToCart(activeCombo, comboSelection, 1);
    closeComboPicker();
  };

  const comboCount = order.cart
    .filter((line) => line.kind === "item" && line.catalogId === "combo-palace")
    .reduce((sum, line) => sum + line.qty, 0);

  const comboGroups = activeCombo
    ? [
        {
          key: "comboBowlId",
          title: "Elige tu bowl",
          options: availableOptions(activeCombo.comboOptions.bowls),
        },
        {
          key: "comboDrinkId",
          title: "Elige tu bebida",
          options: availableOptions(activeCombo.comboOptions.drinks),
        },
        {
          key: "comboRiceCakeId",
          title: "Elige tu Rice Cake",
          options: availableOptions(activeCombo.comboOptions.riceCakes),
        },
      ]
    : [];

  // Si alguna categoría se quedó sin opciones disponibles (todo agotado), no
  // hay combo válido que armar — se avisa en vez de dejar confirmar algo que
  // el servidor va a rechazar de todos modos.
  const comboFullyUnavailable =
    activeCombo && comboGroups.some((group) => group.options.length === 0);

  return (
    <div className={`${styles.wrapper} ${isKiosk ? styles.kiosk : ""}`}>
      <div className={styles.container}>
        <div className={styles.header}>
          {isKiosk && (
            <p className={styles.kioskEyebrow}>HECHO AL MOMENTO, PARA TI</p>
          )}
          {isKiosk ? (
            <h1 className={styles.title}>¿Qué se te antoja hoy?</h1>
          ) : (
            <h2 className={styles.title}>Menú</h2>
          )}
          <p className={styles.subtitle}>
            {isKiosk
              ? "Tu propia combinación o un favorito de la casa. Tú eliges."
              : "Arma tu bowl o agrega lo que quieras — puedes juntar varios bowls y artículos en un solo pedido."}
          </p>
        </div>

        {isKiosk ? (
          <button
            type="button"
            className={styles.kioskHero}
            onClick={handleBuildBowl}
          >
            <span className={styles.kioskHeroCopy}>
              <span className={styles.kioskEyebrow}>TU BOWL, TUS REGLAS</span>
              <strong>
                {hasBowlDraft ? "Tu bowl te espera." : "Arma tu propio bowl."}
              </strong>
              <span className={styles.kioskHeroDescription}>
                {hasBowlDraft
                  ? "Continúa donde lo dejaste y dale tu toque final."
                  : "Elige tu base, proteínas y todos esos ingredientes que te encantan."}
              </span>
              <span className={styles.kioskHeroPrice}>
                Desde ${BOWL_BASE_PRICE} <small>MXN</small>
              </span>
              <span className={styles.kioskHeroAction}>
                {hasBowlDraft ? "Continuar mi bowl" : "Empezar mi bowl"}{" "}
                <ArrowRight size={20} aria-hidden="true" />
              </span>
            </span>
            <span className={styles.kioskHeroPhoto}>
              <img
                src={kioskBowlPhoto}
                alt="Bowl de Poke Palace con ingredientes frescos"
                fetchPriority="high"
              />
              <span>Así empieza algo rico.</span>
            </span>
          </button>
        ) : (
          <button
            type="button"
            className={`${styles.buildBowlCard} ${isKiosk ? styles.buildBowlCardKiosk : ""}`}
            style={{ backgroundImage: `url(${buildBowlBg})` }}
            onClick={handleBuildBowl}
          >
            <div className={styles.buildBowlOverlay} />
            <span className={styles.buildBowlBadge}>¡Personalízalo!</span>
            <span className={styles.buildBowlIcon} aria-hidden="true">
              🍚
            </span>
            <span className={styles.buildBowlText}>
              <strong>
                {hasBowlDraft ? "Continuar tu bowl" : "Arma tu propio bowl"}
              </strong>
              <span className={styles.buildBowlHint}>
                {hasBowlDraft
                  ? "Tienes un bowl a medio armar — sigue donde lo dejaste"
                  : "Elige base, proteínas, marinados y más"}
              </span>
            </span>
            <span className={styles.buildBowlArrow} aria-hidden="true">
              →
            </span>
          </button>
        )}

        {isKiosk && (
          <nav className={styles.categoryNav} aria-label="Categorías del menú">
            {CUSTOMER_CATALOG_CATEGORIES.filter(
              (category) => category !== "Combos" || comboPalaceActive === true,
            ).map((category) => (
              <a key={category} href={`#kiosk-menu-${category}`}>
                {category}
                <ArrowRight size={15} aria-hidden="true" />
              </a>
            ))}
          </nav>
        )}

        {CUSTOMER_CATALOG_CATEGORIES.map((category) => {
          const items = CUSTOMER_CATALOG.filter((item) => {
            if (item.category !== category) return false;
            // El Combo Palace solo corre lunes, miércoles y viernes. Como es
            // el único artículo de su categoría, esconderlo deja la sección
            // vacía y el `return null` de abajo la quita entera. El servidor
            // también lo rechaza fuera de esos días, esto es solo UX.
            if (item.isCombo && comboPalaceActive !== true) return false;
            return true;
          });
          if (items.length === 0) return null;
          return (
            <section
              key={category}
              id={isKiosk ? `kiosk-menu-${category}` : undefined}
              className={styles.section}
            >
              <h3 className={styles.sectionTitle}>
                {!isKiosk && (
                  <span aria-hidden="true">{CATEGORY_ICONS[category]}</span>
                )}{" "}
                {category}
              </h3>
              <div className={styles.grid}>
                {items.map((item) => {
                  const qty = qtyForCatalogItem(item.catalogId);
                  return (
                    <div
                      key={item.catalogId}
                      className={`${styles.card} ${item.image ? styles.cardWithPhoto : styles.cardIconOnly} ${isKiosk && item.isCombo ? styles.kioskComboCard : ""}`}
                    >
                      {item.image ? (
                        <div className={styles.cardPhotoWrap}>
                          <img
                            src={item.image}
                            alt=""
                            className={`${styles.cardPhoto} ${item.imageFit === "contain" ? styles.cardPhotoContain : ""}`}
                            loading="lazy"
                          />
                          <div className={styles.cardPhotoOverlay} />
                        </div>
                      ) : (
                        <span
                          className={styles.cardIconBadge}
                          aria-hidden="true"
                        >
                          {item.icon}
                        </span>
                      )}

                      <div className={styles.cardBody}>
                        <div className={styles.cardBodyText}>
                          <p className={styles.cardName}>{item.name}</p>
                          {item.description && (
                            <p className={styles.cardDescription}>
                              {item.description}
                            </p>
                          )}
                          <p className={styles.cardPrice}>
                            {formatPrice(item.price)}
                          </p>
                        </div>

                        {item.isCombo ? (
                          <div className={styles.comboAddWrap}>
                            {comboCount > 0 && (
                              <span className={styles.comboCount}>
                                {comboCount} en carrito
                              </span>
                            )}
                            <button
                              type="button"
                              className={styles.addBtn}
                              onClick={() => openComboPicker(item)}
                              aria-label={`Elegir ${item.name}`}
                            >
                              Elegir
                            </button>
                          </div>
                        ) : qty > 0 ? (
                          <div className={styles.stepper}>
                            <button
                              type="button"
                              className={styles.stepperBtn}
                              onClick={() => handleRemove(item)}
                              aria-label={`Quitar ${item.name}`}
                            >
                              −
                            </button>
                            <span
                              className={styles.stepperCount}
                              aria-live="polite"
                            >
                              {qty}
                            </span>
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
                          <button
                            type="button"
                            className={styles.addBtn}
                            onClick={() => handleAdd(item)}
                            aria-label={`Agregar ${item.name}`}
                          >
                            Agregar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {isKiosk && (
          <p className={styles.kioskPaymentNote}>
            Elige a tu ritmo. Al terminar, revisa tu pedido y paga en caja.
          </p>
        )}
      </div>

      {activeCombo && (
        <div className={styles.comboBackdrop} onMouseDown={closeComboPicker}>
          <div
            className={styles.comboModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="combo-palace-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.comboModalHeader}>
              <div>
                <h3 id="combo-palace-title">Arma tu Combo Palace</h3>
                <p>
                  Un bowl, una bebida y un Rice Cake por{" "}
                  {formatPrice(activeCombo.price)}.
                </p>
              </div>
              <button
                type="button"
                className={styles.comboClose}
                onClick={closeComboPicker}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className={styles.comboGroups}>
              {comboGroups.map((group) => (
                <fieldset key={group.key} className={styles.comboGroup}>
                  <legend>{group.title}</legend>
                  {group.options.length === 0 && (
                    <p className={styles.comboGroupEmpty}>
                      Agotado por ahora, no hay opciones disponibles.
                    </p>
                  )}
                  <div className={styles.comboOptions}>
                    {group.options.map((option) => {
                      const catalogItem = CUSTOMER_CATALOG_BY_ID[option.id];
                      const selected = comboSelection[group.key] === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`${styles.comboOption} ${selected ? styles.comboOptionSelected : ""}`}
                          onClick={() =>
                            setComboSelection((current) => ({
                              ...current,
                              [group.key]: option.id,
                            }))
                          }
                          aria-pressed={selected}
                        >
                          {catalogItem?.image ? (
                            <img
                              src={catalogItem.image}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <span aria-hidden="true">
                              {catalogItem?.icon || "•"}
                            </span>
                          )}
                          <span className={styles.comboOptionText}>
                            <strong>{option.label}</strong>
                            {catalogItem?.description && (
                              <small>{catalogItem.description}</small>
                            )}
                          </span>
                          {selected && (
                            <span
                              className={styles.comboCheck}
                              aria-hidden="true"
                            >
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>

            {comboFullyUnavailable ? (
              <p
                className={styles.comboGroupEmpty}
                style={{ textAlign: "center" }}
              >
                El Combo Palace no está disponible en este momento — vuelve más
                tarde.
              </p>
            ) : (
              <button
                type="button"
                className={styles.comboConfirm}
                onClick={confirmCombo}
              >
                Agregar Combo Palace · {formatPrice(activeCombo.price)}
              </button>
            )}
          </div>
        </div>
      )}

      {/* En la web del cliente el carrito vive en CartBar, fijo en todas las
          pantallas. Aquí solo queda para el kiosco, que usa otro layout y no
          monta esa barra. */}
      {isKiosk && cartCount > 0 && (
        <button type="button" className={styles.cartBar} onClick={onGoToCart}>
          <span className={styles.cartBarCount}>
            <ShoppingBag size={19} aria-hidden="true" /> {cartCount} artículo
            {cartCount === 1 ? "" : "s"}
          </span>
          <span>
            Ver pedido · {formatPrice(cartSubtotal)}{" "}
            <ArrowRight size={20} aria-hidden="true" />
          </span>
        </button>
      )}
    </div>
  );
};

export default MenuBrowser;
