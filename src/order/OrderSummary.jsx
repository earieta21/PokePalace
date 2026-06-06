import React from "react";
import { useOrder } from "./OrderContext";
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

  const finalMarinades = marinades;

  // Fallback: "white_rice" -> "White Rice"
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
              <span key={`${chip}-${idx}`} className={styles.chip}>
                {chip}
              </span>
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

        <Section
          title="Base"
          value={getLabel(BASE_LABELS, base)}
          onEdit={() => onEditStep(0)}
        />

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

        <Section
          title="Marinados"
          chips={marinadesLabels}
          emptyText="Sin marinados seleccionados"
          onEdit={() => onEditStep(2)}
        />

        <Section
          title="Complementos"
          chips={complementsLabels}
          emptyText="Sin complementos seleccionados"
          onEdit={() => onEditStep(3)}
        />

        <Section
          title="Salsas"
          chips={saucesLabels}
          emptyText="Sin salsas seleccionadas"
          onEdit={() => onEditStep(4)}
        />

        <Section
          title="Toppings"
          chips={toppingsLabels}
          emptyText="Sin toppings seleccionados"
          onEdit={() => onEditStep(5)}
        />

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

        <div className={styles.actions}>
          {submitError && (
            <p className={styles.submitError} role="alert">
              {submitError}
            </p>
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
