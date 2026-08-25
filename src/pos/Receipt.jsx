import { createPortal } from "react-dom";
import { PROTEIN_LABELS } from "../order/OrderLabels.jsx";
import { comboPalaceSelectionSummary } from "../data/comboPalace.js";
import ui from "./Receipt.module.css";

export const PAYMENT_METHOD_LABELS = {
  card_terminal: "Tarjeta",
  cash: "Efectivo",
  pay_at_pickup: "Pendiente de pago",
};

// Shared print target for the POS (cobro) and el historial de órdenes
// (reimpresión) — a hidden node that only shows up via the @media print
// rules in Receipt.module.css when window.print() runs.
export default function Receipt({ order }) {
  if (!order || typeof document === "undefined") return null;

  const printedAt = new Date(order.createdAt || Date.now()).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const hasCustomBowl = Boolean(order.base);
  const itemsSubtotal = (order.items || []).reduce((sum, item) => sum + item.price * item.qty, 0);
  const bowlPrice = hasCustomBowl ? Math.max(0, (order.subtotal || 0) - itemsSubtotal) : 0;
  const discount = order.discountAmount || 0;

  return createPortal(
    <section className={ui.receipt} aria-label="Ticket de venta">
      <header className={ui.receiptHeader}>
        <strong>POKE PALACE</strong>
      </header>

      <div className={ui.receiptMeta}>
        <span>{printedAt}</span>
        {order.customer && order.customer !== "Walk-in" && <span>Cliente: {order.customer}</span>}
      </div>

      <div className={ui.receiptLines}>
        {(order.items || []).map((item) => (
          <div
            className={ui.receiptLine}
            key={item.cartKey || [item.catalogId, item.protein, item.comboBowlId, item.comboDrinkId, item.comboRiceCakeId].filter(Boolean).join("-") || item.name}
          >
            <span>
              {item.qty} × {item.name}
              {item.protein ? ` (${PROTEIN_LABELS[item.protein] || item.protein})` : ""}
              {item.catalogId === "combo-palace" ? ` — ${comboPalaceSelectionSummary(item)}` : ""}
            </span>
            <span>${(item.price * item.qty).toLocaleString("es-MX")}</span>
          </div>
        ))}

        {hasCustomBowl && (
          <div className={ui.receiptLine}>
            <span>1 × Bowl {order.bowlSize === "large" ? "grande" : "mediano"}</span>
            <span>${bowlPrice.toLocaleString("es-MX")}</span>
          </div>
        )}
      </div>

      <div className={ui.receiptTotals}>
        <div><span>Subtotal</span><span>${(order.subtotal ?? itemsSubtotal + bowlPrice).toLocaleString("es-MX")}</span></div>
        {discount > 0 && <div><span>Premio aplicado</span><span>−${discount.toLocaleString("es-MX")}</span></div>}
        <div><strong>Total</strong><strong>${(order.total ?? 0).toLocaleString("es-MX")}</strong></div>
        <div><span>Pago</span><span>{PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}</span></div>
      </div>

      <div className={ui.receiptFooter}>
        <span>¡Gracias por su compra!</span>
      </div>
    </section>,
    document.body,
  );
}
