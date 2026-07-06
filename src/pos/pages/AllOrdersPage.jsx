import { useState, useEffect, useContext } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";

const STATUS_CFG = {
  pending:   { cls: "badgeYellow", label: "Nuevo" },
  preparing: { cls: "badgeBlue",   label: "Preparando" },
  ready:     { cls: "badgeGreen",  label: "Listo" },
  completed: { cls: "badgeGreen",  label: "Completado" },
  cancelled: { cls: "badgeRed",    label: "Cancelado" },
};

const SOURCE_LABEL = { online: "En línea", pos: "POS" };

export default function AllOrdersPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState("all");

  useEffect(() => {
    const q = statusFilter !== "all" ? `?status=${statusFilter}&limit=100` : "?limit=100";
    api.get(`/api/staff/orders${q}`)
      .then((d) => setOrders(d.orders ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [statusFilter, staffToken]);

  const visible = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const id       = o._id.slice(-5).toLowerCase();
    const cliente  = (o.customer || o.user?.name || o.user?.email || "").toLowerCase();
    return id.includes(q) || cliente.includes(q);
  });

  const total = visible.reduce((s, o) => s + (o.total ?? 0), 0);

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Todas las Órdenes</h1>
          <p className={styles.pageSubtitle}>
            {loading ? "Cargando…" : `${visible.length} órdenes · $${total.toLocaleString("es-MX")} MXN total`}
          </p>
        </div>
        <button className={styles.btnGhost}>Exportar CSV</button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          className={styles.input} style={{ maxWidth: 240 }}
          placeholder="Buscar por ID o cliente…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.select} style={{ width: 180 }}
          value={statusFilter}
          onChange={(e) => { setStatus(e.target.value); setLoading(true); }}
        >
          <option value="all">Todos los estados</option>
          <option value="pending">Nuevo</option>
          <option value="preparing">Preparando</option>
          <option value="ready">Listo</option>
          <option value="completed">Completado</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID Orden</th><th>Fecha / Hora</th><th>Cliente</th>
              <th>Fuente</th><th>Total</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--p-muted)" }}>Cargando órdenes…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--p-muted)" }}>Sin resultados</td></tr>
            ) : visible.map((o) => {
              const { cls, label } = STATUS_CFG[o.status] ?? STATUS_CFG.pending;
              const cliente = o.customer || o.user?.name || o.user?.email?.split("@")[0] || "—";
              return (
                <tr key={o._id}>
                  <td className={styles.tdMono}>#{o._id.slice(-5).toUpperCase()}</td>
                  <td className={styles.tdMuted}>
                    {new Date(o.createdAt).toLocaleString("es-MX", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td style={{ fontWeight: 500 }}>{cliente}</td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeGray}`}>
                      {SOURCE_LABEL[o.source] ?? o.source}
                    </span>
                  </td>
                  <td className={styles.tdMono}>{o.total != null ? `$${o.total.toLocaleString("es-MX")} MXN` : "—"}</td>
                  <td><span className={`${styles.badge} ${styles[cls]}`}>{label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
