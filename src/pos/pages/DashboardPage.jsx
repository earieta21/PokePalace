import { useState, useEffect, useContext } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";

const STATUS_CFG = {
  completed: { cls: "badgeGreen",  label: "Completado" },
  preparing: { cls: "badgeBlue",   label: "Preparando" },
  pending:   { cls: "badgeYellow", label: "Nuevo" },
  ready:     { cls: "badgeGreen",  label: "Listo" },
  cancelled: { cls: "badgeRed",    label: "Cancelado" },
};

const SOURCE_LABEL = { online: "En línea", pos: "POS" };

export default function DashboardPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [stats, setStats]     = useState(null);
  const [recent, setRecent]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/api/staff/orders/stats"),
      api.get("/api/staff/orders?limit=6"),
    ])
      .then(([s, o]) => { setStats(s); setRecent(o.orders ?? []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [staffToken]);

  const hoy = new Date().toLocaleDateString("es-MX", {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Panel</h1>
          <p className={styles.pageSubtitle} style={{ textTransform: "capitalize" }}>{hoy}</p>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Órdenes Hoy</p>
          <p className={styles.statValue}>{loading ? "—" : stats?.total ?? 0}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Ingresos Hoy</p>
          <p className={styles.statValue}>
            {loading ? "—" : stats?.revenue ? `$${stats.revenue.toFixed(2)}` : "$0"}
          </p>
          <p className={styles.statSub}>Órdenes POS</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>En Cocina</p>
          <p className={styles.statValue}>
            {loading ? "—" : (stats?.pending ?? 0) + (stats?.preparing ?? 0)}
          </p>
          <p className={styles.statSub}>Pendientes + preparando</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Completados</p>
          <p className={styles.statValue}>{loading ? "—" : stats?.completed ?? 0}</p>
        </div>
      </div>

      <div className={styles.card}>
        <p className={styles.cardTitle}>Órdenes Recientes</p>
        {loading ? (
          <p style={{ color: "var(--p-muted)", fontSize: 13 }}>Cargando…</p>
        ) : recent.length === 0 ? (
          <p style={{ color: "var(--p-muted)", fontSize: 13 }}>Sin órdenes hoy todavía</p>
        ) : (
          <div className={styles.tableWrap} style={{ boxShadow: "none", border: "none" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Orden</th><th>Hora</th><th>Cliente</th>
                  <th>Fuente</th><th>Total</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => {
                  const { cls, label } = STATUS_CFG[o.status] ?? STATUS_CFG.pending;
                  const cliente = o.customer || o.user?.name || o.user?.email?.split("@")[0] || "—";
                  return (
                    <tr key={o._id}>
                      <td className={styles.tdMono}>#{o._id.slice(-5).toUpperCase()}</td>
                      <td className={styles.tdMuted}>
                        {new Date(o.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ fontWeight: 500 }}>{cliente}</td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeGray}`}>
                          {SOURCE_LABEL[o.source] ?? o.source}
                        </span>
                      </td>
                      <td className={styles.tdMono}>{o.total != null ? `$${o.total.toFixed(2)}` : "—"}</td>
                      <td><span className={`${styles.badge} ${styles[cls]}`}>{label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
