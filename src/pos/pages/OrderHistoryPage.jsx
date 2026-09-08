import { useState, useEffect, useContext } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import {
  BASE_LABELS, PROTEIN_LABELS, MARINADE_LABELS,
  COMPLEMENT_LABELS, SAUCE_LABELS, TOPPING_LABELS,
} from "../../order/OrderLabels";
import { REFERRAL_SOURCE_LABELS } from "../../data/referralSources.js";
import Receipt, { PAYMENT_METHOD_LABELS } from "../Receipt.jsx";
import { comboPalaceSelectionSummary } from "../../data/comboPalace";

const STATUS_CFG = {
  completed: { cls: "badgeGreen", label: "Completado" },
  cancelled: { cls: "badgeRed",   label: "Cancelado" },
};

const SOURCE_LABEL = { online: "En línea", pos: "POS", whatsapp: "WhatsApp" };
const FULFILLMENT_LABEL = { pickup: "Para llevar", dine_in: "En restaurante", delivery: "Delivery" };
const PAYMENT_STATUS_LABEL = { paid: "Pagado", pending: "Pendiente de pago" };

const RANGES = [
  { id: "today", label: "Hoy" },
  { id: "week",  label: "7 días" },
  { id: "month", label: "30 días" },
];

const labelList = (ids, labels) => (ids || []).map((id) => labels[id] ?? id);

// Una línea legible por bowl/artículo — a diferencia del resumen de la
// tabla (una sola frase truncada), aquí cada campo del bowl es su propio
// renglón para poder leerlo completo en el detalle.
function orderLines(order) {
  const lines = [];

  const bowlLine = (bowl, index) => {
    const bases = bowl.bases?.length > 1 ? bowl.bases : (bowl.base ? [bowl.base] : []);
    lines.push({
      title: `Bowl ${index != null ? `${index} ` : ""}${bowl.bowlSize === "large" ? "Grande" : "Normal"}`,
      rows: [
        ["Base", labelList(bases, BASE_LABELS).join(" + ") || "—"],
        ["Proteína", labelList(bowl.proteins, PROTEIN_LABELS).join(", ") || "—"],
        ["Marinado", labelList(bowl.marinades, MARINADE_LABELS).join(", ") || "—"],
        ["Complementos", labelList(bowl.complements, COMPLEMENT_LABELS).join(", ") || "—"],
        ["Salsas", labelList(bowl.sauces, SAUCE_LABELS).join(", ") || "—"],
        ["Toppings", labelList(bowl.toppings, TOPPING_LABELS).join(", ") || "—"],
        ...(bowl.extraScoopProteins?.length
          ? [["Proteína extra", labelList(bowl.extraScoopProteins, PROTEIN_LABELS).join(", ")]]
          : []),
      ],
    });
  };

  if (order.cartItems?.length) {
    let bowlIndex = 0;
    for (const line of order.cartItems) {
      if (line.kind === "item") {
        const combo = line.catalogId === "combo-palace" ? ` — ${comboPalaceSelectionSummary(line)}` : "";
        lines.push({ title: `${line.qty} × ${line.name}${combo}`, rows: [] });
      } else if (line.kind === "promo2x1") {
        bowlIndex += 1;
        lines.push({
          title: "Promo 2x1 en Bowls",
          rows: [["Proteína compartida", PROTEIN_LABELS[line.protein] ?? line.protein ?? "—"]],
        });
        (line.bowls || []).forEach((bowl) => bowlLine(bowl, ++bowlIndex));
      } else {
        bowlIndex += 1;
        bowlLine(line, bowlIndex);
      }
    }
    return lines;
  }

  (order.items || []).forEach((item) => {
    const proteinSuffix = item.protein ? ` (${PROTEIN_LABELS[item.protein] ?? item.protein})` : "";
    const comboSuffix = item.catalogId === "combo-palace" ? ` — ${comboPalaceSelectionSummary(item)}` : "";
    lines.push({ title: `${item.qty} × ${item.name}${proteinSuffix}${comboSuffix}`, rows: [] });
  });

  if (order.base) bowlLine(order, null);

  return lines.length > 0 ? lines : [{ title: "Bowl personalizado", rows: [] }];
}

// Resumen de una sola frase para la columna de la tabla — se sigue
// truncando ahí por espacio, pero el detalle completo ya no depende de
// esta frase (ver orderLines).
function itemBrief(order) {
  return orderLines(order).map((l) => l.title).join(" + ");
}

function DetailRow({ label, value }) {
  if (!value || value === "—") return null;
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "3px 0" }}>
      <span style={{ color: "var(--p-muted)", minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ color: "var(--p-ink)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function OrderDetailModal({ order, styles, onClose, onPrint }) {
  if (!order) return null;
  const { cls, label } = STATUS_CFG[order.status] ?? STATUS_CFG.completed;
  const cliente = order.customer || order.user?.name || order.user?.email || "—";
  const fullDate = new Date(order.createdAt).toLocaleString("es-MX", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de la orden #${order._id.slice(-5).toUpperCase()}`}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.5)", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--p-surface, #fff)", borderRadius: 14, padding: 22,
          width: "min(520px, 100%)", maxHeight: "85vh", overflowY: "auto",
          boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <span style={{ fontSize: 11, color: "var(--p-muted)", textTransform: "capitalize" }}>{fullDate}</span>
            <h2 style={{ margin: "2px 0 0", fontSize: 18 }}>#{order._id.slice(-5).toUpperCase()}</h2>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "var(--p-muted)", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, margin: "10px 0 16px", flexWrap: "wrap" }}>
          <span className={`${styles.badge} ${styles[cls]}`} style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{label}</span>
          <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "rgba(0,0,0,0.06)", color: "var(--p-muted)" }}>
            {SOURCE_LABEL[order.source] ?? order.source}
          </span>
          {order.fulfillment && (
            <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: "rgba(0,0,0,0.06)", color: "var(--p-muted)" }}>
              {FULFILLMENT_LABEL[order.fulfillment] ?? order.fulfillment}
            </span>
          )}
        </div>

        <section style={{ marginBottom: 14 }}>
          <DetailRow label="Cliente" value={cliente} />
          <DetailRow label="Teléfono" value={order.phone} />
          <DetailRow label="Notas" value={order.notes} />
          <DetailRow
            label="Cómo nos conoció"
            value={order.referralSource === "otro" && order.referralSourceOther
              ? order.referralSourceOther
              : REFERRAL_SOURCE_LABELS[order.referralSource]}
          />
        </section>

        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--p-g2, #2d6a4f)" }}>
          Contenido de la orden
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          {orderLines(order).map((line, i) => (
            <div key={i} style={{ padding: "10px 12px", border: "1px solid var(--p-border, rgba(0,0,0,0.08))", borderRadius: 10 }}>
              <strong style={{ fontSize: 13 }}>{line.title}</strong>
              {line.rows.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {line.rows.map(([label, value]) => <DetailRow key={label} label={label} value={value} />)}
                </div>
              )}
            </div>
          ))}
        </div>

        <section style={{ borderTop: "1px solid var(--p-border, rgba(0,0,0,0.08))", paddingTop: 10, marginBottom: 16 }}>
          <DetailRow label="Subtotal" value={order.subtotal != null ? `$${order.subtotal.toLocaleString("es-MX")}` : null} />
          {order.discountAmount > 0 && <DetailRow label="Descuento" value={`−$${order.discountAmount.toLocaleString("es-MX")}`} />}
          {order.rewardCode && <DetailRow label="Código de premio" value={order.rewardCode} />}
          <DetailRow label="Total" value={order.total != null ? `$${order.total.toLocaleString("es-MX")} MXN` : null} />
          <DetailRow
            label="Pago"
            value={`${PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}${order.paymentStatus ? ` · ${PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus}` : ""}`}
          />
        </section>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button" onClick={() => onPrint(order)}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", background: "transparent", color: "var(--p-ink)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            🖨️ Imprimir ticket
          </button>
          <button
            type="button" onClick={onClose}
            style={{ padding: "10px 14px", borderRadius: 8, border: "none", background: "var(--p-g2, #2d6a4f)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrderHistoryPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");
  const [range, setRange]   = useState("today");
  const [search, setSearch] = useState("");
  const [printOrder, setPrintOrder] = useState(null);
  const [printRequested, setPrintRequested] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const handlePrint = (order) => {
    setPrintOrder(order);
    setPrintRequested(true);
  };

  useEffect(() => {
    if (!printRequested || !printOrder) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPrintRequested(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [printRequested, printOrder]);

  useEffect(() => {
    setLoading(true);
    api.get("/api/staff/orders?status=completed,cancelled&limit=200")
      .then((d) => setOrders(d.orders ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken]);

  const now = new Date();
  const filtered = orders
    .filter((o) => {
      const ms = now - new Date(o.createdAt);
      if (range === "today") return new Date(o.createdAt).toDateString() === now.toDateString();
      if (range === "week")  return ms < 7  * 86400000;
      return ms < 30 * 86400000;
    })
    .filter((o) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        o._id.slice(-5).toLowerCase().includes(q) ||
        (o.customer || o.user?.name || o.user?.email || "").toLowerCase().includes(q)
      );
    });

  const revenue = filtered
    .filter((o) => o.status === "completed" && o.total != null)
    .reduce((s, o) => s + o.total, 0);

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Historial de Órdenes</h1>
          <p className={styles.pageSubtitle}>
            {loading
              ? "Cargando…"
              : `${filtered.length} órdenes · $${revenue.toLocaleString("es-MX")} MXN completadas · toca una fila para ver el detalle completo`}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 3, background: "rgba(0,0,0,0.04)", borderRadius: 8, padding: 3 }}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "none",
                background: range === r.id ? "var(--p-surface)" : "transparent",
                color: range === r.id ? "var(--p-ink)" : "var(--p-muted)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: range === r.id ? "var(--p-shadow)" : "none",
                fontFamily: "Inter, sans-serif",
                transition: "background 130ms",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <input
          className={styles.input}
          style={{ maxWidth: 220 }}
          placeholder="Buscar por ID o cliente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Hora</th>
              <th>Cliente</th>
              <th>Contenido</th>
              <th>Fuente</th>
              <th>Total</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--p-muted)" }}>
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--p-muted)" }}>
                  Sin órdenes en este período
                </td>
              </tr>
            ) : (
              filtered.map((o) => {
                const { cls, label } = STATUS_CFG[o.status] ?? STATUS_CFG.completed;
                const cliente = o.customer || o.user?.name || o.user?.email?.split("@")[0] || "—";
                const brief = itemBrief(o);
                return (
                  <tr
                    key={o._id}
                    onClick={() => setSelectedOrder(o)}
                    style={{ cursor: "pointer" }}
                    title="Ver detalle completo"
                  >
                    <td className={styles.tdMono}>#{o._id.slice(-5).toUpperCase()}</td>
                    <td className={styles.tdMuted}>
                      {new Date(o.createdAt).toLocaleString("es-MX", {
                        month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td style={{ fontWeight: 500 }}>{cliente}</td>
                    <td
                      className={styles.tdMuted}
                      title={brief}
                      style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {brief}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgeGray}`}>
                        {SOURCE_LABEL[o.source] ?? o.source}
                      </span>
                    </td>
                    <td className={styles.tdMono}>
                      {o.total != null ? `$${o.total.toLocaleString("es-MX")} MXN` : "—"}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles[cls]}`}>{label}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handlePrint(o); }}
                        style={{
                          padding: "5px 10px",
                          borderRadius: 6,
                          border: "1px solid rgba(0,0,0,0.12)",
                          background: "transparent",
                          color: "var(--p-muted)",
                          cursor: "pointer",
                          fontSize: 11.5,
                          fontWeight: 600,
                        }}
                      >
                        🖨️ Imprimir
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          styles={styles}
          onClose={() => setSelectedOrder(null)}
          onPrint={handlePrint}
        />
      )}

      <Receipt order={printOrder} />
    </div>
  );
}
