import React, { useContext, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useOrder } from "./OrderContext";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../config";
import { PREMIUM_PROTEIN_PRICES, computeCartPricing } from "./pricing";
import { useLanguage } from "../i18n/LanguageContext";
import { comboPalaceSelectionLabels } from "../data/comboPalace";
import { MXN_PER_POINT, REWARDS, SIGNUP_BONUS_POINTS } from "../data/rewardsCatalog";
import KioskPairingQr from "../kiosk/KioskPairingQr";
import CheckoutSuggestions from "./CheckoutSuggestions";
import SaveFavoriteBowl from "./SaveFavoriteBowl";
import kioskPairStyles from "../kiosk/KioskPairingQr.module.css";
import styles from "./OrderSummary.module.css";

import {
  ITEM_LABELS,
  getBaseLabel,
} from "./OrderLabels";

const OrderSummary = ({
  onBuildBowl,
  onBrowseMenu,
  onRestart,
  onConfirm,
  pickup,
  pausedMessage = "",
  retrying = false,
  onPromoChange,
  pointsDiscount = 0,
  saving = false,
  submitError = "",
  showOnlinePayment = false,
  isKiosk = false,
  pairing = null,
  onPaired,
}) => {
  const { order, startNewBowl, editCartBowl, removeCartLine, updateCartItemQty } = useOrder();
  const { isLoggedIn, token } = useContext(AuthContext);
  const location = useLocation();
  const { language, t } = useLanguage();
  const labels = ITEM_LABELS[language] || ITEM_LABELS.es;

  const cart = Array.isArray(order?.cart) ? order.cart : [];
  const { fulfillment = "pickup", updateCheckout } = order || {};

  // Promo code state
  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoApplied, setPromoApplied] = useState(null);
  // El campo de código arranca escondido: la mayoría no trae código y
  // tenerlo abierto solo agrega ruido al checkout.
  const [showPromo, setShowPromo] = useState(Boolean(order?.promoCode));

  // Delivery is temporarily unavailable until the checkout can collect an address.
  // Normalize old saved drafts so they cannot silently submit as delivery orders.
  useEffect(() => {
    if (fulfillment === "delivery") {
      updateCheckout("fulfillment", "pickup");
    }
  }, [fulfillment, updateCheckout]);

  // Restaura el código promocional guardado en el pedido (localStorage) al
  // recargar la página o al volver del flujo de "editar" — sin esto,
  // promoApplied nace en null y el total mostrado no incluye el descuento
  // aunque el pedido sí lo tenga guardado.
  const savedPromoCode = order?.promoCode || "";
  useEffect(() => {
    const code = savedPromoCode.trim();
    if (!code) return undefined;
    if (promoApplied?.code === code.toUpperCase()) return undefined;

    let cancelled = false;
    setPromoInput(code);
    fetch(`${API_URL}/api/promo-codes/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.code === code.toUpperCase()) {
          setPromoApplied(data);
          onPromoChange?.(data);
        } else {
          // El código guardado ya no es válido — se limpia para que el
          // total mostrado siempre coincida con lo que de verdad cobrará
          // el servidor.
          updateCheckout("promoCode", "");
          onPromoChange?.(null);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPromoCode]);

  const prettifyId = (value) => {
    if (!value || typeof value !== "string") return t("summary.empty");
    return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getListLabels = (map, values = []) => {
    if (!Array.isArray(values) || values.length === 0) return [];
    return values.map((v) => map?.[v] || prettifyId(v));
  };

  const proteinLabelsFor = (proteins) => (Array.isArray(proteins) ? proteins : []).map((id) => {
    const label = labels.protein?.[id] || prettifyId(id);
    const upcharge = PREMIUM_PROTEIN_PRICES[id] || 0;
    return upcharge > 0 ? `${label} (+$${upcharge})` : label;
  });

  const pricing = computeCartPricing(cart, promoApplied);
  const appliedPointsDiscount = Math.min(Math.max(0, pointsDiscount), pricing.total);
  const finalTotal = Math.max(0, pricing.total - appliedPointsDiscount);
  // Para el invitado: lo que se llevaría si crea su cuenta antes de pedir
  // (bono de bienvenida + los puntos de este pedido) y el mejor premio que ya
  // le alcanzaría con eso.
  const signupOrderPoints = Math.floor(finalTotal / MXN_PER_POINT);
  const signupTotalPoints = SIGNUP_BONUS_POINTS + signupOrderPoints;
  const signupReward = REWARDS
    .filter((reward) => reward.cost <= signupTotalPoints)
    .sort((a, b) => b.cost - a.cost)[0];
  // 2x1 en Bowls es solo para comer en el restaurante — el servidor rechaza
  // igual esta combinación, pero bloquear aquí evita que el cliente llegue
  // hasta el envío para enterarse.
  const hasDineInPromo = cart.some((line) => line.kind === "promo2x1");
  const hasPromo2x1BlockedByFulfillment = hasDineInPromo && order.fulfillment !== "dine_in";
  // Cómo se llama "comer aquí" en cada pantalla, para que los avisos del 2x1
  // nombren el mismo botón que el cliente ve.
  const dineInLabel = isKiosk ? "Para comer aquí" : "Comer en restaurante";
  const chooseFulfillment = (nextFulfillment) => {
    order.updateCheckout("fulfillment", nextFulfillment);
    // La programación de hora solo aplica a "para llevar" — si el cliente
    // cambia a "comer aquí", se descarta para que no quede una hora
    // programada obsoleta pegada al pedido.
    if (nextFulfillment === "dine_in") {
      order.updateCheckout("isScheduled", false);
      order.updateCheckout("scheduledPickupTime", "");
    }
  };
  const choosePickupTime = (custom) => {
    updateCheckout("isScheduled", custom);
    updateCheckout("scheduledPickupTime", custom ? order.scheduledPickupTime || pickup.min : "");
  };

  const paymentOptions = [
    ...(showOnlinePayment
      ? [{ value: "online", icon: "⚡", label: t("summary.online"), badge: "Rápido y fácil" }]
      : []),
    { value: "pay_at_pickup", icon: "🏪", label: t("summary.payAtPickup") },
    { value: "cash", icon: "💵", label: t("summary.cash") },
    { value: "card_terminal", icon: "💳", label: t("summary.cardTerminal") },
  ];

  const handleApplyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoError("");
    setPromoApplied(null);
    try {
      const res = await fetch(`${API_URL}/api/promo-codes/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || t("summary.promoInvalid"));
      setPromoApplied(data);
      onPromoChange?.(data);
      order.updateCheckout("promoCode", data.code);
    } catch (e) {
      setPromoError(e.message);
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoApplied(null);
    setPromoInput("");
    setPromoError("");
    onPromoChange?.(null);
    order.updateCheckout("promoCode", "");
  };

  const handleRestart = () => {
    if (window.confirm(t("summary.restartConfirm"))) {
      onRestart?.();
    }
  };

  const handleEditBowl = (cartId) => {
    editCartBowl(cartId);
    onBuildBowl?.();
  };

  const handleAddAnotherBowl = () => {
    startNewBowl();
    onBuildBowl?.();
  };

  const renderBowlLine = (line) => {
    const proteinLabels = proteinLabelsFor(line.proteins);
    const marinadesLabels = getListLabels(labels.marinade, line.marinades);
    const complementsLabels = getListLabels(labels.complement, line.complements);
    const saucesLabels = getListLabels(labels.sauce, line.sauces);
    const toppingsLabels = getListLabels(labels.topping, line.toppings);
    // Lo que de verdad define el bowl (base y proteina) va en grande; el
    // resto se junta en una sola linea gris. Antes eran 6 renglones con su
    // propia etiqueta y el cliente no los leia.
    const headline = [
      getBaseLabel(line.bases, line.base, language),
      proteinLabels.join(", "),
    ].filter(Boolean).join(" \u00b7 ");
    const extras = [
      ...marinadesLabels,
      ...complementsLabels,
      ...saucesLabels,
      ...toppingsLabels,
    ].join(" \u00b7 ");

    return (
      <div className={styles.section} key={line.cartId}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.subTitle}>
              <span className={styles.sectionIcon} aria-hidden="true">🍱</span>
              {line.bowlSize === "large" ? t("summary.large") : t("summary.normal")}
              <span className={styles.subTitleCount}>· ${line.price.toFixed(2)}</span>
            </h3>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className={styles.editButton} onClick={() => handleEditBowl(line.cartId)} type="button">
              {t("summary.edit")}
            </button>
            <button className={styles.editButton} onClick={() => removeCartLine(line.cartId)} type="button">
              {t("summary.remove")}
            </button>
          </div>
        </div>
        <p className={styles.detailMain} id={`bowl-${line.cartId}`}>{headline}</p>
        {extras && <p className={styles.detailExtras}>{extras}</p>}
        {isLoggedIn && !isKiosk && (
          <SaveFavoriteBowl line={line} token={token} descriptionId={`bowl-${line.cartId}`} />
        )}
      </div>
    );
  };

  const PromoLineCard = ({ line }) => {
    const proteinLabel = labels.protein?.[line.protein] || prettifyId(line.protein);
    const blockedByFulfillment = order.fulfillment !== "dine_in";
    return (
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.subTitle}>
              <span className={styles.sectionIcon} aria-hidden="true">🎉</span>
              2x1 en Bowls
              <span className={styles.subTitleCount}>· ${line.price.toFixed(2)}</span>
            </h3>
            <p className={styles.detailMain}>{proteinLabel}</p>
            <p className={styles.detailExtras}>Una proteína para los 2 bowls · solo para comer aquí</p>
          </div>
          <button className={styles.editButton} onClick={() => removeCartLine(line.cartId)} type="button">
            {t("summary.remove")}
          </button>
        </div>
        {blockedByFulfillment && (!pickup || pickup.open) && (
          <p className={styles.submitError} role="alert" style={{ marginTop: 8 }}>
            Cambia la entrega a “{dineInLabel}” para conservar el 2x1.
          </p>
        )}
        {(line.bowls || []).map((bowl, index) => {
          const title = `Bowl ${index + 1} \u00b7 ${getBaseLabel(bowl.bases, bowl.base, language)}`;
          const extras = [
            ...getListLabels(labels.marinade, bowl.marinades),
            ...getListLabels(labels.complement, bowl.complements),
            ...getListLabels(labels.sauce, bowl.sauces),
            ...getListLabels(labels.topping, bowl.toppings),
          ].join(" \u00b7 ");
          return (
            <div key={index} className={styles.promoBowl}>
              <p className={styles.detailMain}>{title}</p>
              {extras && <p className={styles.detailExtras}>{extras}</p>}
            </div>
          );
        })}
      </div>
    );
  };

  const ItemLineCard = ({ line }) => {
    const comboLabels = line.catalogId === "combo-palace" ? comboPalaceSelectionLabels(line) : [];
    return (
      <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h3 className={styles.subTitle}>{line.name}</h3>
          <p className={styles.detail}>${line.price.toFixed(2)} MXN c/u</p>
          {comboLabels.map((label, index) => (
            <p key={label} className={styles.detail}>
              {index === 0 ? "🍣" : index === 1 ? "🥤" : "🍫"} {label}
            </p>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className={styles.editButton}
              onClick={() => updateCartItemQty(line.cartId, line.qty - 1)}
              aria-label={`Quitar un ${line.name}`}
            >
              −
            </button>
            <span aria-live="polite">{line.qty}</span>
            <button
              type="button"
              className={styles.editButton}
              onClick={() => updateCartItemQty(line.cartId, line.qty + 1)}
              aria-label={`Agregar otro ${line.name}`}
            >
              +
            </button>
          </div>
          <button className={styles.editButton} onClick={() => removeCartLine(line.cartId)} type="button">
            {t("summary.remove")}
          </button>
        </div>
      </div>
      </div>
    );
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t("summary.title")}</h2>
        </div>

        {cart.length === 0 ? (
          <div className={styles.emptyRow}>
            <p>Tu carrito está vacío.</p>
            <button className={styles.favBtn} type="button" onClick={() => onBrowseMenu?.()}>
              Ir al menú
            </button>
          </div>
        ) : (
          <>
            {cart.map((line) => (
              line.kind === "item"
                ? <ItemLineCard key={line.cartId} line={line} />
                : line.kind === "promo2x1"
                  ? <PromoLineCard key={line.cartId} line={line} />
                  : renderBowlLine(line)
            ))}

            <CheckoutSuggestions isKiosk={isKiosk} />

            <div className={styles.actionButtons} style={{ marginBottom: 20 }}>
              <button className={styles.restartButton} type="button" onClick={handleAddAnotherBowl}>
                + Agregar otro bowl
              </button>
              <button className={styles.restartButton} type="button" onClick={() => onBrowseMenu?.()}>
                + Agregar del menú
              </button>
            </div>
          </>
        )}

        {isKiosk && (
          pairing
            ? (
              <div className={kioskPairStyles.paired}>
                <span className={kioskPairStyles.pairedIcon} aria-hidden="true">✅</span>
                <div>
                  <p className={kioskPairStyles.pairedTitle}>¡Hola, {pairing.name}!</p>
                  <p className={kioskPairStyles.pairedSubtitle}>
                    Este pedido acumula puntos en tu cuenta.
                  </p>
                </div>
              </div>
            )
            : <KioskPairingQr onPaired={onPaired} />
        )}

        {!isKiosk && !isLoggedIn && (
          <div className={styles.signupPrompt}>
            <span className={styles.signupPromptIcon} aria-hidden="true">🎁</span>
            {signupOrderPoints > 0 ? (
              <div className={styles.signupPromptText}>
                <p className={styles.signupPromptTitle}>
                  {t("summary.signupPromptOrderTitle", { points: signupTotalPoints })}
                </p>
                <p className={styles.signupPromptSubtitle}>
                  {t("summary.signupPromptOrderSubtitle", { bonus: SIGNUP_BONUS_POINTS, earned: signupOrderPoints })}
                  {signupReward && ` ${t("summary.signupPromptReward", { reward: signupReward.name[language] ?? signupReward.name.es })}`}
                </p>
              </div>
            ) : (
              <div className={styles.signupPromptText}>
                <p className={styles.signupPromptTitle}>{t("summary.signupPromptTitle")}</p>
                <p className={styles.signupPromptSubtitle}>{t("summary.signupPromptSubtitle")}</p>
              </div>
            )}
            <Link
              className={styles.signupPromptButton}
              to="/register"
              state={{ from: location.pathname + location.search }}
            >
              {t("summary.signupPromptCta")}
            </Link>
          </div>
        )}

        {/* Checkout form */}
        <div className={styles.checkoutSection}>
          <div>
            <h3 className={styles.checkoutTitle}>{t("summary.checkoutTitle")}</h3>
          </div>

          <div className={styles.checkoutGrid}>
            <label className={styles.field} style={isKiosk ? { gridColumn: "1 / -1" } : undefined}>
              <span>{t("summary.name")}</span>
              <input
                name="customer"
                value={order.customer || ""}
                onChange={(e) => order.updateCheckout("customer", e.target.value)}
                placeholder={t("summary.namePlaceholder")}
                autoComplete="name"
                required
              />
            </label>

            {!isKiosk && (
              <label className={styles.field}>
                <span>{t("summary.phone")}</span>
                <input
                  name="phone"
                  value={order.phone || ""}
                  onChange={(e) => order.updateCheckout("phone", e.target.value)}
                  placeholder={t("summary.phonePlaceholder")}
                  autoComplete="tel"
                  inputMode="tel"
                  required
                />
              </label>
            )}

            {isKiosk ? (
              // En el kiosco: dos botones grandes en vez de una lista
              // desplegable, que en la iPad cuesta atinarle.
              <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                <span id="kiosk-fulfillment-label">¿Para comer aquí o para llevar?</span>
                <div className={styles.fulfillmentChoices} role="group" aria-labelledby="kiosk-fulfillment-label">
                  {[
                    { value: "dine_in", icon: "🍽️", label: "Para comer aquí" },
                    { value: "pickup", icon: "🛍️", label: "Para llevar" },
                  ].map((opt) => {
                    const active = (order.fulfillment === "dine_in" ? "dine_in" : "pickup") === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`${styles.fulfillmentChoice} ${active ? styles.fulfillmentChoiceActive : ""}`}
                        aria-pressed={active}
                        onClick={() => chooseFulfillment(opt.value)}
                      >
                        <span aria-hidden="true">{opt.icon}</span> {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <label className={styles.field}>
                <span>{t("summary.fulfillment")}</span>
                <select
                  name="fulfillment"
                  value={order.fulfillment === "dine_in" ? "dine_in" : "pickup"}
                  onChange={(e) => chooseFulfillment(e.target.value)}
                >
                  <option value="pickup">{t("summary.pickup")}</option>
                  <option value="dine_in">{t("summary.dineIn")}</option>
                </select>
              </label>
            )}

            {/* En el kiosco siempre se paga en caja: elegir la forma de pago
                ahí no cambia nada y solo es un paso más. */}
            {isKiosk ? (
              <p className={styles.kioskPayNote} style={{ gridColumn: "1 / -1" }}>
                <span aria-hidden="true">💳</span> Pagas en caja al terminar, con efectivo o tarjeta.
              </p>
            ) : (
              <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                <span>{t("summary.payment")}</span>
                <div className={styles.paymentOptions}>
                  {paymentOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`${styles.paymentOption} ${
                        (order.paymentMethod || "pay_at_pickup") === opt.value ? styles.paymentOptionActive : ""
                      }`}
                      onClick={() => order.updateCheckout("paymentMethod", opt.value)}
                    >
                      {opt.badge && <span className={styles.paymentBadge}>{opt.badge}</span>}
                      <span className={styles.paymentIcon}>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Scheduled pickup time — only for pickup, and never at the
              counter kiosk (the customer is already here). */}
          {pickup && !pausedMessage && fulfillment === "pickup" && (pickup.open || !hasDineInPromo) && (
            <div className={styles.scheduleSection}>
              {pickup.open ? <label className={styles.scheduleToggle}>
                <input
                  type="checkbox"
                  checked={order.isScheduled || false}
                  onChange={(e) => choosePickupTime(e.target.checked)}
                />
                <span>{t("summary.schedulePickup")}</span>
              </label> : (
                <fieldset className={styles.pickupChoices}>
                  <legend>{t("summary.closedPickup")}</legend>
                  <label className={styles.scheduleToggle}>
                    <input type="radio" name="pickup-slot" checked={!order.isScheduled} onChange={() => choosePickupTime(false)} />
                    {t(pickup.today ? "summary.pickupToday" : "summary.pickupTomorrow", { time: pickup.time })}
                  </label>
                  <label className={styles.scheduleToggle}>
                    <input type="radio" name="pickup-slot" checked={Boolean(order.isScheduled)} onChange={() => choosePickupTime(true)} />
                    {t("summary.choosePickupTime")}
                  </label>
                </fieldset>
              )}

              {order.isScheduled && (
                <label className={styles.field}>
                  <span>{t("summary.pickupTime")}</span>
                  <input
                    type="datetime-local"
                    value={order.scheduledPickupTime || ""}
                    onChange={(e) => order.updateCheckout("scheduledPickupTime", e.target.value)}
                    min={pickup.min}
                    max={pickup.max}
                    aria-invalid={Boolean(pickup.errorKey)}
                    aria-describedby={pickup.errorKey ? "pickup-time-error" : undefined}
                    required
                    aria-required="true"
                  />
                </label>
              )}
              {pickup.errorKey && <p id="pickup-time-error" className={styles.promoError} role="status">{t(pickup.errorKey)}</p>}
            </div>
          )}

          <label className={styles.field}>
            <span>{t("summary.notes")} <em className={styles.optionalTag}>({t("summary.optional")})</em></span>
            <textarea
              name="notes"
              value={order.notes || ""}
              onChange={(e) => order.updateCheckout("notes", e.target.value)}
              placeholder={t("summary.notesPlaceholder")}
              rows="3"
            />
          </label>
        </div>

        {/* Promo code */}
        <div className={styles.promoSection}>
          {!promoApplied && !showPromo && (
            <button className={styles.promoToggle} type="button" onClick={() => setShowPromo(true)}>
              {t("summary.promoToggle")}
            </button>
          )}
          {!promoApplied ? (showPromo && (
            <div className={styles.promoRow}>
              <input
                className={styles.promoInput}
                placeholder={t("summary.promoPlaceholder")}
                aria-label={t("summary.promoLabel")}
                value={promoInput}
                onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoError(""); }}
                maxLength={20}
                disabled={promoLoading}
              />
              <button
                className={styles.promoBtn}
                type="button"
                onClick={handleApplyPromo}
                disabled={promoLoading || !promoInput.trim()}
              >
                {promoLoading ? t("summary.promoChecking") : t("summary.promoApply")}
              </button>
            </div>
          )) : (
            <div className={styles.promoApplied}>
              <span className={styles.promoSuccess}>
                {promoApplied.code} — {promoApplied.discountType === "percent"
                  ? t("summary.promoPercent", { value: promoApplied.discountValue })
                  : t("summary.promoAmount", { value: promoApplied.discountValue })}
                {promoApplied.description ? ` · ${promoApplied.description}` : ""}
              </span>
              <button className={styles.promoRemoveBtn} type="button" onClick={handleRemovePromo}>
                {t("summary.promoRemove")}
              </button>
            </div>
          )}
          {promoError && <p className={styles.promoError} role="alert">{promoError}</p>}
        </div>

        {/* Price breakdown */}
        <div className={styles.priceSection}>
          {pricing.discount > 0 && (
            <>
              <div className={styles.priceRow}>
                <span>{t("summary.subtotal")}</span>
                <span>${pricing.subtotal.toFixed(2)}</span>
              </div>
              <div className={`${styles.priceRow} ${styles.priceDiscountRow}`}>
                <span>{t("summary.discount")}</span>
                <span>-${pricing.discount.toFixed(2)}</span>
              </div>
            </>
          )}
          {pricing.tax > 0 && (
            <div className={styles.priceRow}>
              <span>{t("summary.tax")}</span>
              <span>${pricing.tax.toFixed(2)}</span>
            </div>
          )}
          {appliedPointsDiscount > 0 && (
            <div className={`${styles.priceRow} ${styles.priceDiscountRow}`}>
              <span>{t("summary.pointsApplied")}</span>
              <span>-${appliedPointsDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className={styles.priceTotalRow}>
            <span>{t("summary.total")}</span>
            <span>${finalTotal.toFixed(2)} MXN</span>
          </div>
          <p className={styles.ivaNote}>{t("summary.taxIncluded")}</p>
        </div>

        <div className={styles.actions}>
          {pausedMessage && <p className={styles.submitError} role="status">{pausedMessage}</p>}
          {!pausedMessage && hasDineInPromo && pickup && !pickup.open && (
            <p className={styles.submitError} role="status">{t("summary.closedDineInPromo")}</p>
          )}
          {!pausedMessage && !hasDineInPromo && pickup?.errorKey === "summary.closedDineIn" && (
            <p className={styles.submitError} role="status">{t(pickup.errorKey)}</p>
          )}
          {submitError && (
            <p className={styles.submitError} role="alert">{submitError}</p>
          )}
          {/* El botón de confirmar queda apagado mientras el 2x1 esté "para
              llevar" — se explica aquí, junto al botón, y no solo arriba en
              la tarjeta de la promo, que en pantallas chicas ni se ve. */}
          {hasPromo2x1BlockedByFulfillment && (!pickup || pickup.open) && (
            <p className={styles.submitError} role="alert">
              El 2x1 es solo para comer en el restaurante.{" "}
              <button
                type="button"
                onClick={() => chooseFulfillment("dine_in")}
                style={{ background: "none", border: 0, padding: 0, color: "inherit", font: "inherit", fontWeight: 800, textDecoration: "underline", cursor: "pointer" }}
              >
                Cambiar a “{dineInLabel}”
              </button>
            </p>
          )}
          <div className={styles.actionButtons}>
            <button
              className={styles.restartButton}
              onClick={handleRestart}
              type="button"
              disabled={saving}
            >
              {t("summary.restart")}
            </button>
            <button
              className={styles.confirmButton}
              onClick={onConfirm}
              type="button"
              disabled={saving || cart.length === 0 || hasPromo2x1BlockedByFulfillment || (!retrying && Boolean(pausedMessage || pickup?.errorKey))}
              aria-busy={saving}
            >
              {saving ? t("summary.sending") : retrying ? t("summary.retryConfirm") : `${t("summary.confirm")} — $${finalTotal.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;
