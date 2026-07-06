import { useState, useEffect, useContext } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import { PROTEIN_LABELS } from "../../order/OrderLabels";

const STATUS_CFG = {
  completed: { cls: "badgeGreen", label: "Completado" },
  cancelled: { cls: "badgeRed",   label: "Cancelado" },
};

const SOURCE_LABEL = { online: "En línea", pos: "POS" };

const RANGES = [
  { id: "today", label: "Hoy" },
  { id: "week",  label: "7 días" },
  { id: "month", label: "30 días" },
];

function itemBrief(order) {
  const parts = [];
  if (order.items?.length) parts.push(order.items.map((i) => `${i.name} ×${i.qty}`).join(", "));
  if (order.base) {
    const proteins = order.proteins?.map((id) => PROTEIN_LABELS[id] ?? id).join(", ") || order.protein || "";
    parts.push(`Bowl ${order.bowlSize === "large" ? "Grande" : "Normal"}: ${proteins} en ${order.base}`);
  }
  return parts.join(" + ") || "Bowl personalizado";
}

export default function OrderHistoryPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");
  const [range, setRange]   = useState("today");
  const [search, setSearch] = useState("");

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
              : `${filtered.length} órdenes · $${revenue.toLocaleString("es-MX")} MXN completadas`}
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
                fontFamily: "Syne, sans-serif",
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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 28, color: "var(--p-muted)" }}>
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 28, color: "var(--p-muted)" }}>
                  Sin órdenes en este período
                </td>
              </tr>
            ) : (
              filtered.map((o) => {
                const { cls, label } = STATUS_CFG[o.status] ?? STATUS_CFG.completed;
                const cliente = o.customer || o.user?.name || o.user?.email?.split("@")[0] || "—";
                return (
                  <tr key={o._id}>
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
                      style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {itemBrief(o)}
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
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
