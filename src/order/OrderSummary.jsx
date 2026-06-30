import React, { useContext, useState } from "react";
import { useOrder } from "./OrderContext";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../config";
import styles from "./OrderSummary.module.css";

import {
  BASE_LABELS,
  PROTEIN_LABELS,
  MARINADE_LABELS,
  COMPLEMENT_LABELS,
  SAUCE_LABELS,
  TOPPING_LABELS,
} from "./OrderLabels";

const OrderSummary = ({ onEditStep, onConfirm, saving = false, submitError = "" }) => {
  const { order } = useOrder();
  const { isLoggedIn, token } = useContext(AuthContext);

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
    if (!value || typeof value !== "string") return "No seleccionado";
    return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getLabel = (map, value) => {
    if (!value) return "No seleccionado";
    return map?.[value] || prettifyId(value);
  };

  const getListLabels = (map, values = []) => {
    if (!Array.isArray(values) || values.length === 0) return [];
    return values.map((v) => map?.[v] || prettifyId(v));
  };

  const marinadesLabels = getListLabels(MARINADE_LABELS, finalMarinades);
  const proteinLabels = getListLabels(
    PROTEIN_LABELS,
    Array.isArray(proteins) && proteins.length > 0 ? proteins : protein ? [protein] : []
  );
  const complementsLabels = getListLabels(COMPLEMENT_LABELS, complements);
  const saucesLabels = getListLabels(SAUCE_LABELS, sauces);
  const toppingsLabels = getListLabels(TOPPING_LABELS, toppings);

  // Time picker helpers
  const getMinTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 15);
    return now.toISOString().slice(0, 16);
  };

  const getMaxTime = () => {
    const now = new Date();
    now.setHours(20, 45, 0, 0);
    return now.toISOString().slice(0, 16);
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
      order.updateCheckout("discountAmount", data.discountType === "fixed" ? data.discountValue : 0);
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
    order.updateCheckout("discountAmount", 0);
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

  const Section = ({ title, value, chips, emptyText, onEdit }) => (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h3 className={styles.subTitle}>{title}</h3>
          {value ? <p className={styles.detail}>{value}</p> : null}
        </div>
        <button className={styles.editButton} onClick={onEdit} type="button">
          Editar
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
          <div className={styles.badge}>Revisa</div>
          <h2 className={styles.title}>Resumen de tu orden</h2>
          <p className={styles.subtitle}>
            Confirma los detalles antes de hacer tu pedido.
          </p>
        </div>

        <Section title="Base" value={getLabel(BASE_LABELS, base)} onEdit={() => onEditStep(0)} />

        <Section
          title="Proteína"
          value={proteinLabels.length > 0 ? proteinLabels.join(", ") : "No seleccionado"}
          onEdit={() => onEditStep(1)}
        />

        <div className={styles.sizeNotice}>
          <span>{bowlSize === "large" ? "Bowl grande" : "Bowl normal"}</span>
          <p>
            {bowlSize === "large"
              ? "3 proteínas seleccionadas · aplica costo extra"
              : "2 proteínas incluidas"}
          </p>
        </div>

        <Section title="Marinados" chips={marinadesLabels} emptyText="Sin marinados seleccionados" onEdit={() => onEditStep(2)} />
        <Section title="Complementos" chips={complementsLabels} emptyText="Sin complementos seleccionados" onEdit={() => onEditStep(3)} />
        <Section title="Salsas" chips={saucesLabels} emptyText="Sin salsas seleccionadas" onEdit={() => onEditStep(4)} />
        <Section title="Toppings" chips={toppingsLabels} emptyText="Sin toppings seleccionados" onEdit={() => onEditStep(5)} />

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
            <h3 className={styles.checkoutTitle}>Datos para el restaurante</h3>
            <p className={styles.checkoutSubtitle}>
              Usaremos esto para identificar tu pedido y avisarte cuando esté listo.
            </p>
          </div>

          <div className={styles.checkoutGrid}>
            <label className={styles.field}>
              <span>Nombre</span>
              <input
                name="customer"
                value={order.customer || ""}
                onChange={(e) => order.updateCheckout("customer", e.target.value)}
                placeholder="Tu nombre"
                autoComplete="name"
                required
              />
            </label>

            <label className={styles.field}>
              <span>Teléfono</span>
              <input
                name="phone"
                value={order.phone || ""}
                onChange={(e) => order.updateCheckout("phone", e.target.value)}
                placeholder="Para avisarte"
                autoComplete="tel"
                inputMode="tel"
                required
              />
            </label>

            <label className={styles.field}>
              <span>Entrega</span>
              <select
                name="fulfillment"
                value={order.fulfillment || "pickup"}
                onChange={(e) => order.updateCheckout("fulfillment", e.target.value)}
              >
                <option value="pickup">Recoger en restaurante</option>
                <option value="dine_in">Comer en restaurante</option>
                <option value="delivery">Delivery</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>Pago</span>
              <select
                name="paymentMethod"
                value={order.paymentMethod || "pay_at_pickup"}
                onChange={(e) => order.updateCheckout("paymentMethod", e.target.value)}
              >
                <option value="pay_at_pickup">Pagar al recoger</option>
                <option value="cash">Efectivo en restaurante</option>
                <option value="card_terminal">Tarjeta en terminal</option>
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
                  <span>Hora de recogida (horario: 10:00 – 21:00)</span>
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
            <span>Notas</span>
            <textarea
              name="notes"
              value={order.notes || ""}
              onChange={(e) => order.updateCheckout("notes", e.target.value)}
              placeholder="Alergias, instrucciones o detalles para cocina"
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
            {saving ? "Enviando pedido…" : "Confirmar Pedido"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;
