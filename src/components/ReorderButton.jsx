import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAvailability } from "../context/AvailabilityContext";
import { useLanguage } from "../i18n/LanguageContext";
import { useOrder } from "../order/OrderContext";
import styles from "./ReorderButton.module.css";

function ReorderDialog({ title, children, onCancel }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
    >
      <h2 id={titleId} tabIndex={-1} autoFocus>{title}</h2>
      {children}
    </dialog>,
    document.body,
  );
}

function ReviewContents({ plan, hasCart, es, onApply, onMenu }) {
  const hasAvailable = plan.cart.length > 0;

  return (
    <>
      {plan.unavailable.length > 0 && (
        <div className={styles.unavailable}>
          {hasAvailable && <h3>{es ? "Hoy no está disponible" : "Unavailable today"}</h3>}
          <ul>{plan.unavailable.map((name) => <li key={name}>{name}</li>)}</ul>
        </div>
      )}
      {hasAvailable && hasCart && (
        <p>{es ? "Puedes agregar el pedido a los productos que ya elegiste o reemplazar todo el carrito." : "Add this order to the items you already chose or replace everything in your cart."}</p>
      )}
      {hasAvailable && !hasCart && plan.unavailable.length > 0 && (
        <p>{es ? "Puedes continuar con lo disponible y revisar tu carrito antes de pagar." : "Continue with the available items and review your cart before checkout."}</p>
      )}
      {!hasAvailable && (
        <p>{es ? "Puedes elegir otros productos en el menú." : "Choose something else from the menu."}</p>
      )}
      <div className={styles.actions}>
        {hasAvailable ? (
          <>
            <button type="button" className={styles.primary} onClick={() => onApply(hasCart ? "append" : "replace")}>
              {!hasCart && plan.unavailable.length > 0
                ? (es ? "Continuar con lo disponible" : "Continue with available items")
                : (es ? "Agregar al carrito" : "Add to cart")}
            </button>
            {hasCart && (
              <button type="button" className={styles.secondary} onClick={() => onApply("replace")}>
                {es ? "Reemplazar carrito" : "Replace cart"}
              </button>
            )}
          </>
        ) : (
          <button type="button" className={styles.primary} onClick={onMenu}>
            {es ? "Ver menú" : "View menu"}
          </button>
        )}
      </div>
    </>
  );
}

export default function ReorderButton({ pastOrder, className, children }) {
  const { order, prepareReorder, applyReorder } = useOrder();
  const { availabilityStatus, refetch } = useAvailability();
  const { language } = useLanguage();
  const es = language === "es";
  const navigate = useNavigate();
  const [reviewing, setReviewing] = useState(false);
  const hasCart = order.cart.length > 0;
  const plan = useMemo(
    () => reviewing && availabilityStatus === "ready" ? prepareReorder(pastOrder, language) : null,
    [reviewing, availabilityStatus, prepareReorder, pastOrder, language],
  );

  function apply(selection, mode) {
    applyReorder(pastOrder, selection, mode);
    navigate("/summary");
  }

  function start() {
    if (!hasCart && availabilityStatus === "ready") {
      const selection = prepareReorder(pastOrder, language);
      if (selection.cart.length && !selection.unavailable.length) {
        apply(selection, "replace");
        return;
      }
    }
    setReviewing(true);
  }

  const loading = availabilityStatus === "loading";
  const checkingLabel = es ? "Consultando disponibilidad…" : "Checking availability…";
  const title = plan?.cart.length === 0
    ? (es ? "Este pedido no está disponible hoy" : "This order is unavailable today")
    : (es ? "Repetir pedido" : "Order again");

  return (
    <>
      <button type="button" className={className} onClick={start} disabled={loading}>
        {loading ? checkingLabel : children}
      </button>
      {reviewing && (
        <ReorderDialog title={title} onCancel={() => setReviewing(false)}>
          {plan ? (
            <ReviewContents plan={plan} hasCart={hasCart} es={es} onApply={(mode) => apply(plan, mode)} onMenu={() => navigate("/menu")} />
          ) : (
            <>
              <p role="status">{loading ? checkingLabel : (es ? "No se pudo consultar la disponibilidad del menú." : "We couldn’t check menu availability.")}</p>
              <div className={styles.actions}>
                <button type="button" className={styles.primary} onClick={refetch} disabled={loading}>{es ? "Reintentar" : "Try again"}</button>
              </div>
            </>
          )}
          <button type="button" className={styles.cancel} onClick={() => setReviewing(false)}>{es ? "Cancelar" : "Cancel"}</button>
        </ReorderDialog>
      )}
    </>
  );
}
