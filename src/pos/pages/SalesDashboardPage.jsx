import { useState, useEffect, useContext, useCallback } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";

const fmtMXN  = (n) => `$${(n ?? 0).toLocaleString("es-MX")} MXN`;
const fmtHour = (h) => {
  const ampm = h >= 12 ? "pm" : "am";
  const hh   = h % 12 || 12;
  return `${hh}${ampm}`;
};

export default function SalesDashboardPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [stats,     setStats]     = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/staff/orders/stats"),
      api.get("/api/staff/orders/analytics"),
    ])
      .then(([s, a]) => { setStats(s); setAnalytics(a); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken]);

  useEffect(() => { load(); }, [load]);

  const days        = analytics?.days        ?? [];
  const peakHours   = analytics?.peakHours   ?? [];
  const topProteins = analytics?.topProteins ?? [];
  const topPosItems = analytics?.topPosItems ?? [];

  const maxRev   = Math.max(...days.map((d) => d.revenue), 1);
  const maxHour  = Math.max(...peakHours.map((h) => h.count), 1);
  const maxProt  = Math.max(...topProteins.map((p) => p.count), 1);
  const maxPOS   = Math.max(...topPosItems.map((p) => p.count), 1);

  const PROTEIN_LABEL = {
    salmon: "Salmón", tuna: "Atún", shrimp: "Camarón", chicken: "Pollo",
    tofu: "Tofu", crab: "Cangrejo", yellowtail: "Jurel", octopus: "Pulpo",
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Ventas</h1>
          <p className={styles.pageSubtitle}>KPIs de hoy + tendencias 7 días</p>
        </div>
        <button className={styles.btnGhost} onClick={load}>Actualizar</button>
      </div>

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {/* ── KPIs de hoy ── */}
      <div className={styles.statsRow} style={{ marginBottom: 24 }}>
        {[
          { label: "Órdenes hoy",   value: loading ? "—" : stats?.total ?? 0,     sub: "Total del día" },
          { label: "Ingresos hoy",  value: loading ? "—" : fmtMXN(stats?.revenue), sub: "Solo órdenes con total", accent: true },
          { label: "En preparación",value: loading ? "—" : stats?.preparing ?? 0, sub: "En cocina ahora" },
          { label: "Completadas",   value: loading ? "—" : stats?.completed ?? 0, sub: "Entregadas hoy" },
        ].map(({ label, value, sub, accent }) => (
          <div key={label} className={styles.statCard}>
            <p className={styles.statLabel}>{label}</p>
            <p className={`${styles.statValue} ${accent ? styles.statAccent : ""}`}
               style={{ fontSize: 16, lineHeight: 1.3, wordBreak: "break-word" }}>
              {value}
            </p>
            <p className={styles.statSub}>{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Últimos 7 días ── */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <p className={styles.cardTitle}>Ingresos — últimos 7 días</p>
        {loading ? (
          <p style={{ color: "var(--p-muted)", fontSize: 13 }}>Cargando…</p>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 100, marginTop: 12 }}>
            {days.map((d) => {
              const pct = maxRev > 0 ? (d.revenue / maxRev) * 100 : 0;
              return (
                <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 9, color: "var(--p-muted)", fontFamily: "DM Mono,monospace" }}>
                    ${d.revenue > 0 ? (d.revenue / 1000).toFixed(1) + "k" : "0"}
                  </span>
                  <div style={{
                    width: "100%", background: "var(--p-border)", borderRadius: 4,
                    height: `${Math.max(pct, 4)}%`, minHeight: 4,
                    background: "linear-gradient(180deg,#4A7A5A,#6aab82)",
                    transition: "height 400ms",
                  }} />
                  <span style={{ fontSize: 10, color: "var(--p-muted)", fontFamily: "Syne,sans-serif", fontWeight: 600 }}>
                    {d.day}
                  </span>
                  <span style={{ fontSize: 9, color: "var(--p-muted)" }}>{d.orders}p</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.grid2} style={{ alignItems: "start", gap: 20, marginBottom: 20 }}>

        {/* ── Horas pico ── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Horas pico (30 días)</p>
          {loading ? (
            <p style={{ color: "var(--p-muted)", fontSize: 13 }}>Cargando…</p>
          ) : peakHours.length === 0 ? (
            <p style={{ color: "var(--p-muted)", fontSize: 13, paddingTop: 8 }}>Sin datos aún.</p>
          ) : (
            <div className={styles.barChart} style={{ marginTop: 10 }}>
              {peakHours.map((h) => (
                <div key={h.hour} className={styles.barRow}>
                  <span className={styles.barLabel}>{fmtHour(h.hour)}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(h.count / maxHour) * 100}%` }} />
                  </div>
                  <span style={{ fontFamily: "DM Mono,monospace", fontSize: 10.5, color: "var(--p-muted)", width: 40, textAlign: "right", flexShrink: 0 }}>
                    {h.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Top proteínas ── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Proteínas más pedidas</p>
          {loading ? (
            <p style={{ color: "var(--p-muted)", fontSize: 13 }}>Cargando…</p>
          ) : topProteins.length === 0 ? (
            <p style={{ color: "var(--p-muted)", fontSize: 13, paddingTop: 8 }}>Sin datos aún.</p>
          ) : (
            <div className={styles.barChart} style={{ marginTop: 10 }}>
              {topProteins.map((p, i) => (
                <div key={p._id} className={styles.barRow}>
                  <span className={styles.barLabel}>
                    {i + 1}. {PROTEIN_LABEL[p._id] || p._id}
                  </span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(p.count / maxProt) * 100}%` }} />
                  </div>
                  <span style={{ fontFamily: "DM Mono,monospace", fontSize: 10.5, color: "var(--p-muted)", width: 40, textAlign: "right", flexShrink: 0 }}>
                    {p.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Top items del POS ── */}
      {(loading || topPosItems.length > 0) && (
        <div className={styles.card}>
          <p className={styles.cardTitle}>Top productos del POS</p>
          {loading ? (
            <p style={{ color: "var(--p-muted)", fontSize: 13 }}>Cargando…</p>
          ) : (
            <div className={styles.barChart} style={{ marginTop: 10 }}>
              {topPosItems.map((p, i) => (
                <div key={p._id} className={styles.barRow}>
                  <span className={styles.barLabel}>{i + 1}. {p._id || "Sin nombre"}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(p.count / maxPOS) * 100}%` }} />
                  </div>
                  <span style={{ fontFamily: "DM Mono,monospace", fontSize: 10.5, color: "var(--p-muted)", width: 40, textAlign: "right", flexShrink: 0 }}>
                    {p.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
