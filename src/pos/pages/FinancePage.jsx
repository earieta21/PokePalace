const MONTHLY = [
  { month: "Nov",  revenue: 28400, costs: 11800, profit: 16600 },
  { month: "Dic",  revenue: 34200, costs: 13900, profit: 20300 },
  { month: "Ene",  revenue: 26800, costs: 11200, profit: 15600 },
  { month: "Feb",  revenue: 29500, costs: 12100, profit: 17400 },
  { month: "Mar",  revenue: 31200, costs: 12800, profit: 18400 },
  { month: "Abr",  revenue: 33600, costs: 13400, profit: 20200 },
];

const EXPENSE_BREAKDOWN = [
  { category: "Ingredientes",     amount: 7820, pct: 58 },
  { category: "Personal (nómina)",amount: 3200, pct: 24 },
  { category: "Servicios",        amount: 900,  pct: 7  },
  { category: "Empaque",          amount: 540,  pct: 4  },
  { category: "Otros",            amount: 940,  pct: 7  },
];

const latest = MONTHLY[MONTHLY.length - 1];
const maxRev = Math.max(...MONTHLY.map((m) => m.revenue));

export default function FinancePage({ styles }) {
  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Finanzas</h1>
          <p className={styles.pageSubtitle}>Resumen de 6 meses</p>
        </div>
        <button className={styles.btnGhost}>Exportar Reporte</button>
      </div>

      {/* KPIs */}
      <div className={styles.statsRow} style={{ marginBottom: 22 }}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Ingresos (Abr)</p>
          <p className={styles.statValue}>${latest.revenue.toLocaleString()}</p>
          <p className={styles.statSub}>+7.7% vs Mar</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Costos (Abr)</p>
          <p className={styles.statValue}>${latest.costs.toLocaleString()}</p>
          <p className={styles.statSub}>39.9% de ingresos</p>
        </div>
        <div className={styles.statCard}>
          <p className={`${styles.statValue} ${styles.statAccent}`} style={{ marginBottom: 4 }}>
            ${latest.profit.toLocaleString()}
          </p>
          <p className={styles.statLabel}>Ganancia Neta (Abr)</p>
          <p className={styles.statSub}>60.1% margen</p>
        </div>
      </div>

      <div className={styles.grid2} style={{ alignItems: "start", marginBottom: 20 }}>
        {/* Monthly chart */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Ingresos vs Ganancia Mensual</p>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 10,
              height: 120,
              marginTop: 16,
            }}
          >
            {MONTHLY.map((m) => (
              <div
                key={m.month}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
              >
                <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div
                    style={{
                      width: "100%",
                      background: "rgba(45,106,79,0.18)",
                      borderRadius: "3px 3px 0 0",
                      height: `${(m.revenue / maxRev) * 90}px`,
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: "var(--p-g2)",
                        borderRadius: "3px 3px 0 0",
                        height: `${(m.profit / m.revenue) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <span style={{ fontSize: 11, color: "var(--p-muted)", fontWeight: 600 }}>{m.month}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, background: "rgba(45,106,79,0.18)", borderRadius: 2, display: "inline-block" }} />
              Ingresos
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, background: "var(--p-g2)", borderRadius: 2, display: "inline-block" }} />
              Ganancia
            </span>
          </div>
        </div>

        {/* Expense breakdown */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Desglose de Costos — Abr</p>
          <div className={styles.barChart} style={{ marginTop: 14 }}>
            {EXPENSE_BREAKDOWN.map((item) => (
              <div key={item.category} className={styles.barRow}>
                <span className={styles.barLabel}>{item.category}</span>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${item.pct}%` }} />
                </div>
                <span className={styles.barValue}>{item.pct}%</span>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: "1px solid var(--p-border)",
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 600, color: "var(--p-ink)" }}>Total Costos</span>
            <span
              style={{
                fontFamily: "DM Mono, monospace",
                fontWeight: 600,
                color: "var(--p-ink)",
              }}
            >
              ${latest.costs.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Monthly table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Mes</th>
              <th>Ingresos</th>
              <th>Costos</th>
              <th>Ganancia Neta</th>
              <th>Margen</th>
            </tr>
          </thead>
          <tbody>
            {[...MONTHLY].reverse().map((m) => (
              <tr key={m.month}>
                <td style={{ fontWeight: 500 }}>{m.month}</td>
                <td className={styles.tdMono}>${m.revenue.toLocaleString()}</td>
                <td className={styles.tdMono}>${m.costs.toLocaleString()}</td>
                <td className={`${styles.tdMono} ${styles.statAccent}`}>${m.profit.toLocaleString()}</td>
                <td className={styles.tdMuted}>{((m.profit / m.revenue) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
