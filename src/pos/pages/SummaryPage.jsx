import { useState, useEffect, useContext, useCallback } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import ui from "./SummaryPage.module.css";

const fmtMXN = (n) => `$${(n ?? 0).toLocaleString("es-MX")}`;

const PROTEIN_LABEL = {
  salmon: "Salmón", tuna: "Atún", shrimp: "Camarón", chicken: "Pollo",
  tofu: "Tofu", crab: "Cangrejo", yellowtail: "Jurel", octopus: "Pulpo",
};

const fmtHour = (h) => {
  if (h == null) return null;
  const ampm = (x) => `${x % 12 || 12}${x >= 12 ? "pm" : "am"}`;
  return `${ampm(h)}–${ampm((h + 1) % 24)}`;
};

/* Cambio porcentual vs semana pasada. null = sin base de comparación. */
const pctChange = (cur, prev) =>
  prev > 0 ? ((cur - prev) / prev) * 100 : null;

function Delta({ current, previous, goodWhenUp = true }) {
  const pct = pctChange(current, previous);
  if (pct === null) {
    return <span className={`${ui.delta} ${ui.deltaFlat}`}>sin semana previa</span>;
  }
  const rounded = Math.round(pct);
  if (rounded === 0) {
    return <span className={`${ui.delta} ${ui.deltaFlat}`}>= igual que la semana pasada</span>;
  }
  const up = rounded > 0;
  const good = up === goodWhenUp;
  return (
    <span className={`${ui.delta} ${good ? ui.deltaUp : ui.deltaDown}`}>
      {up ? "↑" : "↓"} {Math.abs(rounded)}% vs semana pasada
    </span>
  );
}

export default function SummaryPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.get("/api/staff/summary")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken]);

  useEffect(() => { load(); }, [load]);

  const sales = data?.sales;
  const money = data?.money;
  const noData = !loading && data && sales.orders === 0 && sales.prev.orders === 0;
  const maxDayRev = data ? Math.max(...data.byDay.map((d) => d.revenue), 1) : 1;

  // Alertas en lenguaje claro, calculadas de los datos
  const alerts = [];
  if (data && !loading) {
    const revPct = pctChange(sales.revenue, sales.prev.revenue);
    if (revPct !== null && revPct <= -20) {
      alerts.push({ tone: "bad", icon: "📉", text: `Las ventas van ${Math.abs(Math.round(revPct))}% abajo de la semana pasada.` });
    }
    if (data.inventory.lowCount > 0) {
      alerts.push({ tone: "warn", icon: "📦", text: `${data.inventory.lowCount} artículo${data.inventory.lowCount > 1 ? "s" : ""} con bajo stock — revisa Inventario.` });
    }
    if (data.waste.cost > 0 && data.waste.prev.cost > 0 && data.waste.cost > data.waste.prev.cost) {
      alerts.push({ tone: "warn", icon: "🗑️", text: `La merma subió: ${fmtMXN(data.waste.cost)} esta semana vs ${fmtMXN(data.waste.prev.cost)} la anterior.` });
    }
    if (money.net < 0 && sales.orders > 0) {
      alerts.push({ tone: "bad", icon: "⚠️", text: `Vas en pérdida esta semana: gastos ${fmtMXN(money.expenses)} contra ${fmtMXN(sales.revenue)} de ventas.` });
    }
    if (alerts.length === 0 && !noData) {
      alerts.push({ tone: "ok", icon: "✅", text: "Sin alertas — todo se ve en orden esta semana." });
    }
  }

  const topDish = data?.topProtein
    ? `${PROTEIN_LABEL[data.topProtein.name] || data.topProtein.name} (${data.topProtein.count}×)`
    : data?.topPosItem
    ? `${data.topPosItem.name} (${data.topPosItem.count}×)`
    : null;

  return (
    <div className={ui.summaryRoot}>
      <div className={`${styles.pageHeader} ${ui.pageHeader}`}>
        <div>
          <h1 className={styles.pageTitle}>Resumen semanal</h1>
          <p className={styles.pageSubtitle}>
            {data ? `Semana del ${data.range.from} al ${data.range.to}` : "Cómo va el negocio, en dos minutos."}
          </p>
        </div>
        <div className={ui.headerActions}>
          <button className={styles.btnGhost} onClick={load} title="Volver a cargar los datos">↻ Actualizar</button>
        </div>
      </div>

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p className={ui.loadingText}>Cargando tu resumen…</p>}

      {noData && (
        <div className={ui.emptyHero}>
          <span>🌊</span>
          <strong>Tu resumen se llenará solo</strong>
          <p>
            Cuando el local abra y entren órdenes, aquí verás cada semana tus ventas comparadas
            con la anterior, tu mejor día, la hora pico y avisos de lo que necesita atención — sin
            configurar nada.
          </p>
        </div>
      )}

      {data && !loading && !noData && (
        <>
          <section>
            <div className={ui.sectionTitle}>
              <div><span>Los números</span><strong>¿Cómo va la semana?</strong></div>
            </div>
            <div className={ui.kpiGrid}>
              <div className={ui.kpiCard}>
                <small>Ventas</small>
                <strong>{fmtMXN(sales.revenue)}</strong>
                <Delta current={sales.revenue} previous={sales.prev.revenue} />
              </div>
              <div className={ui.kpiCard}>
                <small>Órdenes</small>
                <strong>{sales.orders}</strong>
                <Delta current={sales.orders} previous={sales.prev.orders} />
              </div>
              <div className={ui.kpiCard}>
                <small>Ticket promedio</small>
                <strong>{fmtMXN(sales.avgTicket)}</strong>
                <Delta current={sales.avgTicket} previous={sales.prev.avgTicket} />
              </div>
              <div className={ui.kpiCard}>
                <small>Ganancia neta</small>
                <strong>{fmtMXN(money.net)}</strong>
                <Delta current={money.net} previous={money.prev.net} />
              </div>
            </div>
          </section>

          <section>
            <div className={ui.sectionTitle}>
              <div><span>Lo destacado</span><strong>Datos rápidos de la semana</strong></div>
            </div>
            <div className={ui.highlightGrid}>
              <div>
                <span className={ui.highlightIcon}>📅</span>
                <span className={ui.highlightText}>
                  <small>Mejor día</small>
                  <strong>{data.bestDay ? `${data.bestDay.day} — ${fmtMXN(data.bestDay.revenue)}` : "Aún sin ventas"}</strong>
                </span>
              </div>
              <div>
                <span className={ui.highlightIcon}>⏰</span>
                <span className={ui.highlightText}>
                  <small>Hora pico</small>
                  <strong>{fmtHour(data.peakHour) || "—"}</strong>
                </span>
              </div>
              <div>
                <span className={ui.highlightIcon}>🥢</span>
                <span className={ui.highlightText}>
                  <small>Lo más pedido</small>
                  <strong>{topDish || "—"}</strong>
                </span>
              </div>
              <div>
                <span className={ui.highlightIcon}>🔁</span>
                <span className={ui.highlightText}>
                  <small>Clientes que regresaron</small>
                  <strong>{data.returningCustomers}</strong>
                </span>
              </div>
            </div>
          </section>

          <div className={ui.chartCard}>
            <p>Ventas por día de la semana</p>
            <div className={ui.dayBars}>
              {data.byDay.map((d) => (
                <div key={d.day} className={`${ui.dayBar} ${data.bestDay?.day === d.day ? ui.dayBarBest : ""}`}>
                  <i>{d.revenue > 0 ? `$${d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : d.revenue}` : ""}</i>
                  <div style={{ height: `${Math.max((d.revenue / maxDayRev) * 100, 4)}%` }} />
                  <span>{d.day}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {data && !loading && (
        <section>
          <div className={ui.sectionTitle}>
            <div><span>Atención</span><strong>Avisos de la semana</strong></div>
          </div>
          <div className={ui.alerts}>
            {alerts.length === 0 && noData && (
              <div className={`${ui.alert} ${ui.alertOk}`}><span>✅</span>Nada pendiente por ahora.</div>
            )}
            {alerts.map((a, i) => (
              <div key={i} className={`${ui.alert} ${a.tone === "bad" ? ui.alertBad : a.tone === "warn" ? ui.alertWarn : ui.alertOk}`}>
                <span>{a.icon}</span>{a.text}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
