import React, { useContext, useState } from "react";
import { useOrder } from "./OrderContext";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../config";
import { computePricing } from "./pricing";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./OrderSummary.module.css";

import {
  ITEM_LABELS,
} from "./OrderLabels";

const OrderSummary = ({ onEditStep, onConfirm, saving = false, submitError = "" }) => {
  const { order } = useOrder();
  const { isLoggedIn, token } = useContext(AuthContext);
  const { language, t } = useLanguage();
  const labels = ITEM_LABELS[language] || ITEM_LABELS.es;

  const {
    base = "",
    protein = "",
    proteins = [],
    bowlSize = "normal",
    marinades = [],
    sauces = [],
    complements = [],
    toppings = [],
  } = order || {};

  // Promo code state
  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoApplied, setPromoApplied] = useState(null);

  // Save favorite state
  const [showSaveFavorite, setShowSaveFavorite] = useState(false);
  const [favoriteName, setFavoriteName] = useState("");
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [favoriteMsg, setFavoriteMsg] = useState("");

  const finalMarinades = marinades;

  const prettifyId = (value) => {
    if (!value || typeof value !== "string") return t("summary.empty");
    return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getLabel = (map, value) => {
    if (!value) return t("summary.empty");
    return map?.[value] || prettifyId(value);
  };

  const getListLabels = (map, values = []) => {
    if (!Array.isArray(values) || values.length === 0) return [];
    return values.map((v) => map?.[v] || prettifyId(v));
  };

  const marinadesLabels = getListLabels(labels.marinade, finalMarinades);
  const proteinLabels = getListLabels(
    labels.protein,
    Array.isArray(proteins) && proteins.length > 0 ? proteins : protein ? [protein] : []
  );
  const complementsLabels = getListLabels(labels.complement, complements);
  const saucesLabels = getListLabels(labels.sauce, sauces);
  const toppingsLabels = getListLabels(labels.topping, toppings);

  const pricing = computePricing(bowlSize, promoApplied);

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
      if (!res.ok) throw new Error(data?.msg || "Código inválido");
      setPromoApplied(data);
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
    order.updateCheckout("promoCode", "");
  };

  const handleSaveFavorite = async () => {
    if (!favoriteName.trim()) return;
    setSavingFavorite(true);
    setFavoriteMsg("");
    try {
      const res = await fetch(`${API_URL}/api/users/me/favorites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: favoriteName.trim(),
          base,
          proteins: Array.isArray(proteins) && proteins.length > 0 ? proteins : protein ? [protein] : [],
          bowlSize,
          marinades,
          complements,
          sauces,
          toppings,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || "Error guardando favorito");
      setFavoriteMsg("Bowl guardado en tus favoritos");
      setFavoriteName("");
      setShowSaveFavorite(false);
    } catch (e) {
      setFavoriteMsg(e.message);
    } finally {
      setSavingFavorite(false);
    }
  };

  const Section = ({ icon, title, value, chips, emptyText, onEdit }) => (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h3 className={styles.subTitle}>
            <span className={styles.sectionIcon} aria-hidden="true">{icon}</span>
            {title}
            {chips && chips.length > 0 && <span className={styles.subTitleCount}>· {chips.length}</span>}
          </h3>
          {value ? <p className={styles.detail}>{value}</p> : null}
        </div>
        <button className={styles.editButton} onClick={onEdit} type="button">
          {t("summary.edit")}
        </button>
      </div>
      {chips ? (
        chips.length > 0 ? (
          <div className={styles.chips}>
            {chips.map((chip, idx) => (
              <span key={`${chip}-${idx}`} className={styles.chip}>{chip}</span>
            ))}
          </div>
        ) : (
          <div className={styles.emptyRow}>{emptyText}</div>
        )
      ) : null}
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

        <Section
          icon="🍚"
          title={t("summary.base")}
          value={getLabel(labels.base, base)}
          onEdit={() => onEditStep(0)}
        />

        <Section
          icon="🐟"
          title={t("summary.protein")}
          value={proteinLabels.length > 0 ? proteinLabels.join(", ") : t("summary.empty")}
          onEdit={() => onEditStep(1)}
        />

        <div className={styles.sizeNotice}>
          <span>{bowlSize === "large" ? t("summary.large") : t("summary.normal")}</span>
          <p>
            {bowlSize === "large"
              ? t("summary.largeDesc")
              : t("summary.normalDesc")}
          </p>
        </div>

        <Section
          icon="✨"
          title={t("summary.marinades")}
          chips={marinadesLabels}
          emptyText={t("summary.noMarinades")}
          onEdit={() => onEditStep(2)}
        />

        <Section
          icon="🥗"
          title={t("summary.complements")}
          chips={complementsLabels}
          emptyText={t("summary.noComplements")}
          onEdit={() => onEditStep(3)}
        />

        <Section
          icon="🥣"
          title={t("summary.sauces")}
          chips={saucesLabels}
          emptyText={t("summary.noSauces")}
          onEdit={() => onEditStep(4)}
        />

        <Section
          icon="🌿"
          title={t("summary.toppings")}
          chips={toppingsLabels}
          emptyText={t("summary.noToppings")}
          onEdit={() => onEditStep(5)}
        />

        {/* Save as favorite */}
        {isLoggedIn && (
          <div className={styles.favoriteSection}>
            {!showSaveFavorite ? (
              <button
                className={styles.favBtn}
                type="button"
                onClick={() => { setShowSaveFavorite(true); setFavoriteMsg(""); }}
              >
                Guardar como favorito
              </button>
            ) : (
              <div className={styles.favoriteRow}>
                <input
                  className={styles.favoriteInput}
                  placeholder="Nombre de tu bowl (ej: Mi Poke Favorito)"
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
                  {savingFavorite ? "Guardando…" : "Guardar"}
                </button>
                <button
                  className={styles.favCancelBtn}
                  type="button"
                  onClick={() => { setShowSaveFavorite(false); setFavoriteName(""); setFavoriteMsg(""); }}
                >
                  Cancelar
                </button>
              </div>
            )}
            {favoriteMsg && (
              <p className={favoriteMsg.startsWith("Bowl guardado") ? styles.promoSuccess : styles.promoError}>
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
                value={order.fulfillment || "pickup"}
                onChange={(e) => order.updateCheckout("fulfillment", e.target.value)}
              >
                <option value="pickup">{t("summary.pickup")}</option>
                <option value="dine_in">{t("summary.dineIn")}</option>
                <option value="delivery">{t("summary.delivery")}</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>{t("summary.payment")}</span>
              <select
                name="paymentMethod"
                value={order.paymentMethod || "pay_at_pickup"}
                onChange={(e) => order.updateCheckout("paymentMethod", e.target.value)}
              >
                <option value="pay_at_pickup">{t("summary.payAtPickup")}</option>
                <option value="cash">{t("summary.cash")}</option>
                <option value="card_terminal">{t("summary.cardTerminal")}</option>
              </select>
            </label>
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
                <span>Programar hora de recogida</span>
              </label>

              {order.isScheduled && (
                <label className={styles.field}>
                  <span>Hora de recogida (horario: 11:00 – 21:00)</span>
                  <input
                    type="datetime-local"
                    value={order.scheduledPickupTime || ""}
                    onChange={(e) => order.updateCheckout("scheduledPickupTime", e.target.value)}
                    min={getMinTime()}
                    max={getMaxTime()}
                  />
                </label>
              )}
            </div>
          )}

          <label className={styles.field}>
            <span>{t("summary.notes")} <em className={styles.optionalTag}>({language === "es" ? "opcional" : "optional"})</em></span>
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
          <p className={styles.promoLabel}>Código promocional</p>
          {!promoApplied ? (
            <div className={styles.promoRow}>
              <input
                className={styles.promoInput}
                placeholder="Ingresa tu código"
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
                {promoLoading ? "Verificando…" : "Aplicar"}
              </button>
            </div>
          ) : (
            <div className={styles.promoApplied}>
              <span className={styles.promoSuccess}>
                {promoApplied.code} — {promoApplied.discountType === "percent"
                  ? `${promoApplied.discountValue}% de descuento`
                  : `$${promoApplied.discountValue} de descuento`}
                {promoApplied.description ? ` · ${promoApplied.description}` : ""}
              </span>
              <button className={styles.promoRemoveBtn} type="button" onClick={handleRemovePromo}>
                Quitar
              </button>
            </div>
          )}
          {promoError && <p className={styles.promoError}>{promoError}</p>}
        </div>

        {/* Price breakdown */}
        <div className={styles.priceSection}>
          {pricing.discount > 0 && (
            <>
              <div className={styles.priceRow}>
                <span>Subtotal</span>
                <span>${pricing.subtotal.toFixed(2)}</span>
              </div>
              <div className={`${styles.priceRow} ${styles.priceDiscountRow}`}>
                <span>Descuento</span>
                <span>-${pricing.discount.toFixed(2)}</span>
              </div>
            </>
          )}
          {pricing.tax > 0 && (
            <div className={styles.priceRow}>
              <span>IVA (16%)</span>
              <span>${pricing.tax.toFixed(2)}</span>
            </div>
          )}
          <div className={styles.priceTotalRow}>
            <span>Total</span>
            <span>${pricing.total.toFixed(2)} MXN</span>
          </div>
          <p className={styles.ivaNote}>Precio con IVA incluido</p>
        </div>

        <div className={styles.actions}>
          {submitError && (
            <p className={styles.submitError} role="alert">{submitError}</p>
          )}
          <button
            className={styles.confirmButton}
            onClick={onConfirm}
            type="button"
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? t("summary.sending") : `${t("summary.confirm")} — $${pricing.total.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;
