import { useState, useEffect, useContext } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";

export default function AnalyticsPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    api.get("/api/staff/analytics")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken]);

  if (loading) return <p style={{ color: "var(--p-muted)", fontSize: 13, padding: 24 }}>Cargando análisis…</p>;
  if (error)   return <p style={{ color: "red", fontSize: 13, padding: 24 }}>{error}</p>;

  const { days = [], topProteins = [], peakHours = [] } = data ?? {};

  const weekOrders  = days.reduce((s, d) => s + d.orders, 0);
  const weekRevenue = days.reduce((s, d) => s + d.revenue, 0);
  const maxOrders   = Math.max(...days.map((d) => d.orders), 1);
  const maxHour     = Math.max(...peakHours.map((h) => h.count), 1);
  const maxProtein  = topProteins[0]?.count || 1;

  const fmtHour = (h) => {
    const ampm = h >= 12 ? "pm" : "am";
    return `${h > 12 ? h - 12 : h || 12}${ampm}`;
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Análisis</h1>
          <p className={styles.pageSubtitle}>Últimos 7 días</p>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Órdenes Semanales</p>
          <p className={styles.statValue}>{weekOrders}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Ingresos Semanales</p>
          <p className={styles.statValue}>{weekRevenue > 0 ? `$${weekRevenue.toFixed(0)}` : "—"}</p>
          <p className={styles.statSub}>Solo órdenes POS</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Mejor Día</p>
          <p className={styles.statValue}>{days.sort((a, b) => b.orders - a.orders)[0]?.day ?? "—"}</p>
        </div>
      </div>

      <div className={styles.grid2} style={{ alignItems: "start", marginBottom: 20 }}>
        {/* Orders per day */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Órdenes por Día</p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, marginTop: 16 }}>
            {[...days].sort((a, b) => {
              const ORDER = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
              return ORDER.indexOf(a.day) - ORDER.indexOf(b.day);
            }).map((d) => (
              <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "var(--p-muted)" }}>{d.orders}</span>
                <div style={{
                  width: "100%",
                  background: "var(--p-g2)",
                  borderRadius: "4px 4px 0 0",
                  height: `${(d.orders / maxOrders) * 90}px`,
                  minHeight: d.orders > 0 ? 4 : 0,
                }} />
                <span style={{ fontSize: 11, color: "var(--p-muted)", fontWeight: 600 }}>{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Peak hours */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Horas Pico (últimos 30 días)</p>
          {peakHours.length === 0 ? (
            <p style={{ color: "var(--p-muted)", fontSize: 13, marginTop: 12 }}>Datos insuficientes aún</p>
          ) : (
            <div className={styles.barChart} style={{ marginTop: 12 }}>
              {peakHours.map((h) => (
                <div key={h.hour} className={styles.barRow}>
                  <span className={styles.barLabel} style={{ width: 44 }}>{fmtHour(h.hour)}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(h.count / maxHour) * 100}%` }} />
                  </div>
                  <span className={styles.barValue}>{h.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top proteins */}
      <div className={styles.card}>
        <p className={styles.cardTitle}>Proteínas Más Pedidas</p>
        {topProteins.length === 0 ? (
          <p style={{ color: "var(--p-muted)", fontSize: 13, marginTop: 8 }}>Datos insuficientes aún</p>
        ) : (
          <div className={styles.barChart} style={{ marginTop: 14 }}>
            {topProteins.map((p) => (
              <div key={p._id} className={styles.barRow}>
                <span className={styles.barLabel}>{p._id}</span>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${(p.count / maxProtein) * 100}%` }} />
                </div>
                <span className={styles.barValue}>{p.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
