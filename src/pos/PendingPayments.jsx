import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, CreditCard, Banknote, RefreshCw } from "lucide-react";
import { StaffAuthContext } from "../context/StaffAuthContext";
import { createStaffApi } from "./api";
import ui from "./PendingPayments.module.css";

// Pedidos que se pagan en caja (kiosco, en línea con pago al recoger,
// "Pendiente" del POS). Cobrarlos aquí anota efectivo o tarjeta, así el
// efectivo entra al corte de caja — marcarlos "Entregado" en cocina los da
// por pagados sin saber cómo.

const SOURCE_LABEL = { online: "Kiosco / en línea", pos: "POS", whatsapp: "WhatsApp" };
const STATUS_LABEL = { pending: "Nuevo", preparing: "Preparando", ready: "Listo", completed: "Entregado" };
const money = (n) => `$${Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;
const code = (order) => `#${String(order._id).slice(-5).toUpperCase()}`;

function summary(order) {
  if (order.cartItems?.length) {
    return order.cartItems.map((line) => (line.kind === "item"
      ? `${line.qty > 1 ? `${line.qty} × ` : ""}${line.name || "Producto"}`
      : line.kind === "promo2x1" ? "Promo 2x1" : "Bowl")).join(", ");
  }
  const parts = (order.items || []).map((item) => `${item.qty > 1 ? `${item.qty} × ` : ""}${item.name}`);
  if (order.base) parts.unshift(order.bowlSize === "large" ? "Bowl grande" : "Bowl mediano");
  return parts.join(", ") || "Pedido";
}

export default function PendingPayments() {
  const { staffToken } = useContext(StaffAuthContext);
  const api = useMemo(() => createStaffApi(staffToken), [staffToken]);
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null); // { id, method }
  const [paying, setPaying] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(() => api.get("/api/staff/orders/unpaid")
    .then((data) => { setOrders(data.orders || []); setError(""); })
    .catch((e) => setError(e.message)), [api]);

  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const charge = async (order, method) => {
    // Primer toque pide confirmar; así un toque accidental no cobra.
    if (confirming?.id !== order._id || confirming?.method !== method) {
      setConfirming({ id: order._id, method });
      return;
    }
    setPaying(order._id);
    setError("");
    try {
      await api.patch(`/api/staff/orders/${order._id}/pay`, { method });
      setOrders((previous) => previous.filter((o) => o._id !== order._id));
      setNotice(`${code(order)} cobrado: ${money(order.total)} en ${method === "cash" ? "efectivo" : "tarjeta"}.`);
    } catch (e) {
      setError(e.message);
      load();
    } finally {
      setPaying(null);
      setConfirming(null);
    }
  };

  const total = orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  if (!orders.length && !notice && !error) return null;

  return (
    <section className={ui.panel} aria-label="Pedidos por cobrar">
      <button type="button" className={ui.bar} aria-expanded={open} onClick={() => setOpen((v) => !v)} disabled={!orders.length}>
        <span className={ui.count}>{orders.length}</span>
        <span className={ui.barText}>
          <strong>{orders.length ? `Por cobrar · ${money(total)}` : "Sin pedidos por cobrar"}</strong>
          <small>Kiosco, en línea y pedidos «Pendiente» que se pagan en caja</small>
        </span>
        {orders.length > 0 && (open ? <ChevronUp size={18} /> : <ChevronDown size={18} />)}
      </button>
      {notice && <p className={ui.notice} role="status">✓ {notice}</p>}
      {error && <p className={ui.error} role="alert">{error}</p>}
      {open && orders.length > 0 && (
        <ul className={ui.list}>
          {orders.map((order) => {
            const askCash = confirming?.id === order._id && confirming.method === "cash";
            const askCard = confirming?.id === order._id && confirming.method === "card_terminal";
            return (
              <li key={order._id} className={ui.row}>
                <div className={ui.info}>
                  <strong>{code(order)} · {order.customer || "Cliente"}</strong>
                  <small>{SOURCE_LABEL[order.source] || order.source} · {STATUS_LABEL[order.status] || order.status} · {new Date(order.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</small>
                  <small className={ui.items}>{summary(order)}</small>
                </div>
                <strong className={ui.amount}>{money(order.total)}</strong>
                <div className={ui.actions}>
                  <button type="button" className={askCash ? ui.confirm : ""} disabled={paying === order._id} onClick={() => charge(order, "cash")}>
                    <Banknote size={16} />{askCash ? `Confirmar ${money(order.total)}` : "Efectivo"}
                  </button>
                  <button type="button" className={askCard ? ui.confirm : ""} disabled={paying === order._id} onClick={() => charge(order, "card_terminal")}>
                    <CreditCard size={16} />{askCard ? `Confirmar ${money(order.total)}` : "Tarjeta"}
                  </button>
                </div>
              </li>
            );
          })}
          <li className={ui.footer}>
            <button type="button" onClick={load}><RefreshCw size={14} />Actualizar</button>
          </li>
        </ul>
      )}
    </section>
  );
}
