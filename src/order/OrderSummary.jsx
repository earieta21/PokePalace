import React, { useContext, useEffect, useState } from "react";
import { useOrder } from "./OrderContext";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../config";
import { PREMIUM_PROTEIN_PRICES, computeCartPricing } from "./pricing";
import { useLanguage } from "../i18n/LanguageContext";
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
  onPromoChange,
  pointsDiscount = 0,
  saving = false,
  submitError = "",
  showOnlinePayment = false,
}) => {
  const { order, startNewBowl, editCartBowl, removeCartLine, updateCartItemQty } = useOrder();
  const { isLoggedIn, token } = useContext(AuthContext);
  const { language, t } = useLanguage();
  const labels = ITEM_LABELS[language] || ITEM_LABELS.es;

  const cart = Array.isArray(order?.cart) ? order.cart : [];
  const { fulfillment = "pickup", updateCheckout } = order || {};

  // Promo code state
  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoApplied, setPromoApplied] = useState(null);

  // Save favorite state — solo tiene sentido cuando el carrito es 1 solo
  // bowl (los favoritos siguen siendo de un bowl, no de un carrito entero).
  const [showSaveFavorite, setShowSaveFavorite] = useState(false);
  const [favoriteName, setFavoriteName] = useState("");
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [favoriteMsg, setFavoriteMsg] = useState("");
  const [favoriteSuccess, setFavoriteSuccess] = useState(false);
  const soleBowlLine = cart.length === 1 && cart[0].kind === "bowl" ? cart[0] : null;

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
  // Time picker helpers — mantiene el rango en línea con lo que de verdad
  // acepta el backend (11:00–21:00), para no dejar elegir una hora que
  // luego se va a rechazar al confirmar. Usa la hora LOCAL del navegador
  // (no toISOString, que da UTC y desfasa el límite varias horas).
  const OPEN_HOUR = 11;
  const CLOSE_HOUR = 21;

  const toLocalDatetimeValue = (date) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const paymentOptions = [
    ...(showOnlinePayment
      ? [{ value: "online", icon: "⚡", label: t("summary.online"), badge: "Rápido y fácil" }]
      : []),
    { value: "pay_at_pickup", icon: "🏪", label: t("summary.payAtPickup") },
    { value: "cash", icon: "💵", label: t("summary.cash") },
    { value: "card_terminal", icon: "💳", label: t("summary.cardTerminal") },
  ];

  const getMinTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 15);
    if (now.getHours() < OPEN_HOUR) {
      now.setHours(OPEN_HOUR, 0, 0, 0);
    } else if (now.getHours() >= CLOSE_HOUR) {
      now.setDate(now.getDate() + 1);
      now.setHours(OPEN_HOUR, 0, 0, 0);
    }
    return toLocalDatetimeValue(now);
  };

  const getMaxTime = () => {
    const now = new Date();
    now.setHours(CLOSE_HOUR - 1, 45, 0, 0);
    if (now < new Date()) now.setDate(now.getDate() + 1);
    return toLocalDatetimeValue(now);
  };

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

  const handleSaveFavorite = async () => {
    if (!favoriteName.trim() || !soleBowlLine) return;
    setSavingFavorite(true);
    setFavoriteMsg("");
    setFavoriteSuccess(false);
    try {
      const res = await fetch(`${API_URL}/api/users/me/favorites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: favoriteName.trim(),
          base: soleBowlLine.base,
          bases: soleBowlLine.bases,
          proteins: soleBowlLine.proteins,
          bowlSize: soleBowlLine.bowlSize,
          marinades: soleBowlLine.marinades,
          complements: soleBowlLine.complements,
          sauces: soleBowlLine.sauces,
          toppings: soleBowlLine.toppings,
          extraScoopProteins: soleBowlLine.extraScoopProteins,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || t("summary.favoriteSaveError"));
      setFavoriteMsg(t("summary.favoriteSaved"));
      setFavoriteSuccess(true);
      setFavoriteName("");
      setShowSaveFavorite(false);
    } catch (e) {
      setFavoriteMsg(e.message);
      setFavoriteSuccess(false);
    } finally {
      setSavingFavorite(false);
    }
  };

  const BowlLineCard = ({ line }) => {
    const proteinLabels = proteinLabelsFor(line.proteins);
    const marinadesLabels = getListLabels(labels.marinade, line.marinades);
    const complementsLabels = getListLabels(labels.complement, line.complements);
    const saucesLabels = getListLabels(labels.sauce, line.sauces);
    const toppingsLabels = getListLabels(labels.topping, line.toppings);
    const rows = [
      { icon: "🍚", title: t("summary.base"), value: getBaseLabel(line.bases, line.base, language) },
      { icon: "🐟", title: t("summary.protein"), value: proteinLabels.join(", ") },
      marinadesLabels.length > 0 && { icon: "🧉", title: t("summary.marinades"), value: marinadesLabels.join(", ") },
      complementsLabels.length > 0 && { icon: "🥗", title: t("summary.complements"), value: complementsLabels.join(", ") },
      saucesLabels.length > 0 && { icon: "🥣", title: t("summary.sauces"), value: saucesLabels.join(", ") },
      toppingsLabels.length > 0 && { icon: "🌿", title: t("summary.toppings"), value: toppingsLabels.join(", ") },
    ].filter(Boolean);

    return (
      <div className={styles.section}>
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
        {rows.map((row) => (
          <p key={row.title} className={styles.detail} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
            <span aria-hidden="true">{row.icon}</span>
            <strong>{row.title}:</strong> {row.value}
          </p>
        ))}
      </div>
    );
  };

  const ItemLineCard = ({ line }) => (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h3 className={styles.subTitle}>{line.name}</h3>
          <p className={styles.detail}>${line.price.toFixed(2)} MXN c/u</p>
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

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.badge}>{t("summary.badge")}</div>
          <h2 className={styles.title}>{t("summary.title")}</h2>
          <p className={styles.subtitle}>
            {t("summary.subtitle")}
          </p>
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
                : <BowlLineCard key={line.cartId} line={line} />
            ))}

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

        {/* Save as favorite — solo si el carrito es 1 solo bowl */}
        {isLoggedIn && soleBowlLine && (
          <div className={styles.favoriteSection}>
            {!showSaveFavorite ? (
              <button
                className={styles.favBtn}
                type="button"
                onClick={() => { setShowSaveFavorite(true); setFavoriteMsg(""); setFavoriteSuccess(false); }}
              >
                {t("summary.saveFavorite")}
              </button>
            ) : (
              <div className={styles.favoriteRow}>
                <input
                  className={styles.favoriteInput}
                  placeholder={t("summary.favoritePlaceholder")}
                  aria-label={t("summary.favoritePlaceholder")}
                  value={favoriteName}
                  onChange={(e) => setFavoriteName(e.target.value)}
                  maxLength={40}
                />
                <button
                  className={styles.favSaveBtn}
                  type="button"
                  onClick={handleSaveFavorite}
                  disabled={savingFavorite || !favoriteName.trim()}
                >
                  {savingFavorite ? t("summary.savingFavorite") : t("summary.save")}
                </button>
                <button
                  className={styles.favCancelBtn}
                  type="button"
                  onClick={() => { setShowSaveFavorite(false); setFavoriteName(""); setFavoriteMsg(""); setFavoriteSuccess(false); }}
                >
                  {t("summary.cancel")}
                </button>
              </div>
            )}
            {favoriteMsg && (
              <p className={favoriteSuccess ? styles.promoSuccess : styles.promoError} role="status" aria-live="polite">
                {favoriteMsg}
              </p>
            )}
          </div>
        )}

        {/* Checkout form */}
        <div className={styles.checkoutSection}>
          <div>
            <h3 className={styles.checkoutTitle}>{t("summary.checkoutTitle")}</h3>
            <p className={styles.checkoutSubtitle}>
              {t("summary.checkoutSubtitle")}
            </p>
          </div>

          <div className={styles.checkoutGrid}>
            <label className={styles.field}>
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

            <label className={styles.field}>
              <span>{t("summary.fulfillment")}</span>
              <select
                name="fulfillment"
                value={order.fulfillment === "dine_in" ? "dine_in" : "pickup"}
                onChange={(e) => {
                  const nextFulfillment = e.target.value;
                  order.updateCheckout("fulfillment", nextFulfillment);
                  // La programación de hora solo aplica a "para llevar" — si
                  // el cliente cambia a "comer aquí", se descarta para que no
                  // quede una hora programada obsoleta pegada al pedido.
                  if (nextFulfillment === "dine_in") {
                    order.updateCheckout("isScheduled", false);
                    order.updateCheckout("scheduledPickupTime", "");
                  }
                }}
              >
                <option value="pickup">{t("summary.pickup")}</option>
                <option value="dine_in">{t("summary.dineIn")}</option>
              </select>
            </label>

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
          </div>

          {/* Scheduled pickup time — only for pickup */}
          {order.fulfillment === "pickup" && (
            <div className={styles.scheduleSection}>
              <label className={styles.scheduleToggle}>
                <input
                  type="checkbox"
                  checked={order.isScheduled || false}
                  onChange={(e) => {
                    order.updateCheckout("isScheduled", e.target.checked);
                    if (!e.target.checked) order.updateCheckout("scheduledPickupTime", "");
                  }}
                />
                <span>{t("summary.schedulePickup")}</span>
              </label>

              {order.isScheduled && (
                <label className={styles.field}>
                  <span>{t("summary.pickupTime")}</span>
                  <input
                    type="datetime-local"
                    value={order.scheduledPickupTime || ""}
                    onChange={(e) => order.updateCheckout("scheduledPickupTime", e.target.value)}
                    min={getMinTime()}
                    max={getMaxTime()}
                    required
                    aria-required="true"
                  />
                </label>
              )}
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
          <p className={styles.promoLabel}>{t("summary.promoLabel")}</p>
          {!promoApplied ? (
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
          ) : (
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
          {submitError && (
            <p className={styles.submitError} role="alert">{submitError}</p>
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
              disabled={saving || cart.length === 0}
              aria-busy={saving}
            >
              {saving ? t("summary.sending") : `${t("summary.confirm")} — $${finalTotal.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;
