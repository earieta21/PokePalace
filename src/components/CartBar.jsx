import { Link, useLocation } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { useOrder } from "../order/OrderContext";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./CartBar.module.css";

// Rutas donde la barra estorba en vez de ayudar: en el resumen el carrito ya
// está en pantalla, y en el armador los botones de Atrás/Siguiente viven
// pegados al fondo en esta misma posición — ahí el acceso al carrito está en
// la barra de arriba (ver .cartLink en OrderPage.module.css). En el kiosco y
// en staff esta barra ni se monta, usan otro layout.
const HIDDEN_ON = new Set(["/summary", "/order"]);

const formatPrice = (value) => `$${Number(value).toLocaleString("es-MX")}`;

// Carrito siempre a la mano. El pedido ya vivía completo en localStorage
// (OrderContext), pero no había forma de verlo hasta el checkout: el cliente
// salía a medio pedido, volvía, y creía que se había perdido todo — hasta
// que al final le aparecían los bowls que ya había armado.
export default function CartBar() {
  const { order } = useOrder();
  const { language } = useLanguage();
  const location = useLocation();

  const cart = Array.isArray(order?.cart) ? order.cart : [];
  const count = cart.reduce((sum, line) => sum + line.qty, 0);
  const total = cart.reduce((sum, line) => sum + line.price * line.qty, 0);

  if (count === 0 || HIDDEN_ON.has(location.pathname)) return null;

  const es = language !== "en";
  const itemsLabel = es
    ? `${count} artículo${count === 1 ? "" : "s"} guardado${count === 1 ? "" : "s"}`
    : `${count} item${count === 1 ? "" : "s"} saved`;

  return (
    <Link
      to="/summary"
      className={styles.bar}
      aria-label={es ? `Ver carrito, ${itemsLabel}` : `View cart, ${itemsLabel}`}
    >
      <span className={styles.icon} aria-hidden="true">
        <ShoppingBag size={17} />
        <span className={styles.count}>{count}</span>
      </span>
      <span className={styles.label}>
        <span className={styles.labelTitle}>
          {es ? "Ver mi carrito" : "View my cart"}
        </span>
        <span className={styles.labelHint}>{itemsLabel}</span>
      </span>
      <span className={styles.total}>{formatPrice(total)}</span>
    </Link>
  );
}
