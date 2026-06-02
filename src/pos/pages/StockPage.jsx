import { useState, useEffect, useContext } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";

function statusOf(item) {
  if (item.qty <= 0)           return "critical";
  if (item.qty < item.minQty)  return "low";
  return "ok";
}

const STATUS_CFG = {
  ok:       { cls: "badgeGreen",  label: "OK" },
  low:      { cls: "badgeYellow", label: "Bajo" },
  critical: { cls: "badgeRed",    label: "Crítico" },
};

export default function StockPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    api.get("/api/staff/inventory")
      .then((d) => setItems(d.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken]);

  // Sort: critical first, then low, then ok
  const sorted = [...items].sort((a, b) => {
    const order = { critical: 0, low: 1, ok: 2 };
    return order[statusOf(a)] - order[statusOf(b)];
  });

  const lowCount      = items.filter((i) => statusOf(i) === "low").length;
  const criticalCount = items.filter((i) => statusOf(i) === "critical").length;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Stock</h1>
          <p className={styles.pageSubtitle}>
            {loading ? "Cargando…" : `${lowCount + criticalCount} artículos requieren atención`}
          </p>
        </div>
        <button className={styles.btnGhost} onClick={() => {
          setLoading(true);
          api.get("/api/staff/inventory")
            .then((d) => setItems(d.items ?? []))
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
        }}>
          Actualizar
        </button>
      </div>

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Total Artículos</p>
          <p className={styles.statValue}>{items.length}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Stock Bajo</p>
          <p className={styles.statValue}>{lowCount}</p>
          <p className={styles.statSub}>Por debajo del mínimo</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Crítico</p>
          <p className={styles.statValue}>{criticalCount}</p>
          <p className={styles.statSub}>Necesita reorden</p>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Ingrediente</th><th>Actual</th><th>Unidad</th><th>Mínimo</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--p-muted)" }}>Cargando…</td></tr>
            ) : sorted.map((row) => {
              const { cls, label } = STATUS_CFG[statusOf(row)];
              return (
                <tr key={row._id}>
                  <td style={{ fontWeight: 500 }}>{row.item}</td>
                  <td className={styles.tdMono}>{row.qty}</td>
                  <td className={styles.tdMuted}>{row.unit}</td>
                  <td className={styles.tdMono}>{row.minQty}</td>
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
