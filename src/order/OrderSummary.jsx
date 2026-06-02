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
          value={getLabel(PROTEIN_LABELS, protein)}
          onEdit={() => onEditStep(1)}
        />

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
