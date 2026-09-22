import { useState, useEffect, useContext, useCallback, useMemo } from "react";
import { Download, RefreshCw } from "lucide-react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { REFERRAL_SOURCE_LABELS } from "../../data/referralSources.js";
import { downloadCSV } from "../../utils/csv";
import { createStaffApi } from "../api";

const fmtMXN = (n) => `$${Math.round(n ?? 0).toLocaleString("es-MX")} MXN`;
const fmtNumber = (n) => (n ?? 0).toLocaleString("es-MX");
const fmtHour = (h) => {
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 || 12;
  return `${hh}${ampm}`;
};

const SOURCE_LABEL = { pos: "POS", online: "En línea", whatsapp: "WhatsApp" };
const FULFILLMENT_LABEL = { pickup: "Pickup", dine_in: "Comer aquí", delivery: "Delivery" };
const PAYMENT_LABEL = {
  cash: "Efectivo",
  card_terminal: "Terminal",
  online: "Pago online",
  pay_at_pickup: "Pendiente",
};
const PROTEIN_LABEL = {
  salmon: "Salmón",
  tuna: "Atún",
  shrimp: "Camarón",
  chicken: "Pollo",
  tofu: "Tofu",
  crab: "Cangrejo",
  yellowtail: "Jurel",
  octopus: "Pulpo",
  seared_tuna: "Atún sellado",
};
const EMPTY_LIST = [];

const pctChange = (current, previous) => {
  if (!previous && current > 0) return 100;
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
};

function deltaText(current, previous, suffix = "") {
  const delta = pctChange(current, previous);
  if (Math.abs(delta) < 1) return `Sin cambio${suffix}`;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${Math.round(delta)}%${suffix}`;
}

function MetricCard({ styles, label, value, sub, tone = "default" }) {
  return (
    <div className={`${styles.statCard} ${styles.salesMetricCard || ""}`}>
      <p className={styles.statLabel}>{label}</p>
      <p className={`${styles.statValue} ${tone === "good" ? styles.statAccent : ""}`}>{value}</p>
      {sub && <p className={styles.statSub}>{sub}</p>}
    </div>
  );
}

function EmptyState({ styles, children }) {
  return <p className={styles.salesEmpty}>{children}</p>;
}

function BarList({ styles, items, max, getLabel, getValue, getMeta, valueWidth = 54 }) {
  if (!items.length) return <EmptyState styles={styles}>Sin datos suficientes todavía.</EmptyState>;
  return (
    <div className={styles.barChart}>
      {items.map((item, index) => {
        const value = getValue(item);
        const width = max > 0 ? (value / max) * 100 : 0;
        return (
          <div key={item._id ?? item.hour ?? item.day ?? index} className={styles.barRow}>
            <span className={styles.barLabel}>{getLabel(item, index)}</span>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${Math.max(width, value > 0 ? 4 : 0)}%` }} />
            </div>
            <span className={styles.barValue} style={{ width: valueWidth }}>
              {getMeta ? getMeta(item) : fmtNumber(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function SalesDashboardPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = useMemo(() => createStaffApi(staffToken), [staffToken]);

  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      api.get("/api/staff/orders/stats"),
      api.get("/api/staff/orders/analytics"),
    ])
      .then(([s, a]) => {
        setStats(s);
        setAnalytics(a);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const days = analytics?.days ?? EMPTY_LIST;
  const peakHours = analytics?.peakHours ?? EMPTY_LIST;
  const topProteins = analytics?.topProteins ?? EMPTY_LIST;
  const topPosItems = analytics?.topPosItems ?? EMPTY_LIST;
  const referralSources = analytics?.referralSources ?? EMPTY_LIST;
  const sourceMix = analytics?.sourceMix ?? EMPTY_LIST;
  const fulfillmentMix = analytics?.fulfillmentMix ?? EMPTY_LIST;
  const paymentMethods = analytics?.paymentMethods ?? EMPTY_LIST;
  const cashierSales = analytics?.cashierSales ?? EMPTY_LIST;

  const summary = useMemo(() => {
    const today = days[days.length - 1] ?? { orders: 0, revenue: 0 };
    const yesterday = days[days.length - 2] ?? { orders: 0, revenue: 0 };
    const priorDays = days.slice(0, -1);
    const weekOrders = days.reduce((sum, day) => sum + (day.orders ?? 0), 0);
    const weekRevenue = days.reduce((sum, day) => sum + (day.revenue ?? 0), 0);
    const avgPriorRevenue = priorDays.length
      ? priorDays.reduce((sum, day) => sum + (day.revenue ?? 0), 0) / priorDays.length
      : 0;
    const bestHour = [...peakHours].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
    const totalOrders = stats?.total ?? today.orders ?? 0;
    const todayRevenue = stats?.revenue ?? today.revenue ?? 0;

    return {
      today,
      yesterday,
      weekOrders,
      weekRevenue,
      avgPriorRevenue,
      bestHour,
      ticketAvg: totalOrders > 0 ? todayRevenue / totalOrders : 0,
      activeQueue: (stats?.pending ?? 0) + (stats?.preparing ?? 0) + (stats?.ready ?? 0),
    };
  }, [days, peakHours, stats]);

  const maxDayRevenue = Math.max(...days.map((d) => d.revenue ?? 0), 1);
  const maxHour = Math.max(...peakHours.map((h) => h.count ?? 0), 1);
  const maxProtein = Math.max(...topProteins.map((p) => p.count ?? 0), 1);
  const maxPOS = Math.max(...topPosItems.map((p) => p.count ?? 0), 1);
  const maxReferral = Math.max(...referralSources.map((r) => r.count ?? 0), 1);
  const maxCashierRevenue = Math.max(...cashierSales.map((c) => c.revenue ?? 0), 1);
  const sourceTotal = sourceMix.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const fulfillmentTotal = fulfillmentMix.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const paymentTotal = paymentMethods.reduce((sum, item) => sum + (item.revenue ?? 0), 0);

  const actions = [
    summary.activeQueue > 0 && {
      title: "Cuidar flujo de cocina",
      copy: `${summary.activeQueue} órdenes activas entre pendiente, preparando y listo.`,
    },
    summary.bestHour?.count > 0 && {
      title: "Preparar antes del pico",
      copy: `El bloque fuerte suele ser ${fmtHour(summary.bestHour.hour)} con ${summary.bestHour.count} pedidos en 30 días.`,
    },
    topPosItems[0] && {
      title: "Empujar producto ganador",
      copy: `${topPosItems[0]._id} lidera POS con ${topPosItems[0].count} unidades.`,
    },
    referralSources[0] && {
      title: "Reforzar canal de adquisición",
      copy: `${REFERRAL_SOURCE_LABELS[referralSources[0]._id] || referralSources[0]._id} trae más respuestas capturadas.`,
    },
  ].filter(Boolean).slice(0, 3);

  const exportSales = () => {
    downloadCSV("ventas-staff.csv", [
      ["Métrica", "Valor"],
      ["Órdenes hoy", stats?.total ?? 0],
      ["Ingresos hoy", stats?.revenue ?? 0],
      ["Ticket promedio", summary.ticketAvg],
      ["Órdenes 7 días", summary.weekOrders],
      ["Ingresos 7 días", summary.weekRevenue],
      [],
      ["Día", "Órdenes", "Ingresos"],
      ...days.map((day) => [day.dateKey || day.day, day.orders, day.revenue]),
      [],
      ["Producto POS", "Unidades", "Ingreso"],
      ...topPosItems.map((item) => [item._id, item.count, item.revenue ?? 0]),
    ]);
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Ventas</h1>
          <p className={styles.pageSubtitle}>Ritmo de hoy, tendencias y oportunidades de los últimos 30 días</p>
        </div>
        <div className={styles.salesToolbar}>
          <button className={styles.btnGhost} onClick={exportSales} disabled={loading || Boolean(error)}>
            <Download size={15} />
            Exportar
          </button>
          <button className={styles.btnGhost} onClick={load} disabled={loading}>
            <RefreshCw size={15} />
            {loading ? "Actualizando" : "Actualizar"}
          </button>
        </div>
      </div>

      {error && <p className={styles.salesError}>{error}</p>}

      <div className={styles.salesHero}>
        <div>
          <p className={styles.salesEyebrow}>Ingresos hoy</p>
          <strong>{loading ? "—" : fmtMXN(stats?.revenue)}</strong>
          <span>{loading ? "Cargando comparación..." : deltaText(stats?.revenue ?? 0, summary.yesterday.revenue, " vs ayer")}</span>
        </div>
        <div className={styles.salesHeroMeta}>
          <span>Promedio 7 días</span>
          <strong>{loading ? "—" : fmtMXN(summary.weekRevenue / Math.max(days.length, 1))}</strong>
          <span>Hoy vs promedio: {loading ? "—" : deltaText(stats?.revenue ?? 0, summary.avgPriorRevenue)}</span>
        </div>
      </div>

      <div className={styles.statsRow}>
        <MetricCard
          styles={styles}
          label="Órdenes hoy"
          value={loading ? "—" : fmtNumber(stats?.total)}
          sub={loading ? "..." : deltaText(stats?.total ?? 0, summary.yesterday.orders, " vs ayer")}
        />
        <MetricCard
          styles={styles}
          label="Ticket promedio"
          value={loading ? "—" : fmtMXN(summary.ticketAvg)}
          sub="Ingreso por orden no cancelada"
          tone="good"
        />
        <MetricCard
          styles={styles}
          label="En operación"
          value={loading ? "—" : fmtNumber(summary.activeQueue)}
          sub="Pendientes + preparando + listo"
        />
        <MetricCard
          styles={styles}
          label="Completadas"
          value={loading ? "—" : fmtNumber(stats?.completed)}
          sub={`${stats?.cancelled ?? 0} canceladas hoy`}
        />
      </div>

      <div className={styles.salesGridMain}>
        <div className={styles.card}>
          <div className={styles.salesCardHeader}>
            <p className={styles.cardTitle}>Ingresos por día</p>
            <span>Últimos 7 días</span>
          </div>
          {loading ? (
            <EmptyState styles={styles}>Cargando ventas...</EmptyState>
          ) : (
            <div className={styles.salesDayChart}>
              {days.map((day) => {
                const pct = maxDayRevenue > 0 ? (day.revenue / maxDayRevenue) * 100 : 0;
                return (
                  <div key={day.dateKey ?? day.day} className={styles.salesDayColumn}>
                    <span>{fmtMXN(day.revenue).replace(" MXN", "")}</span>
                    <div className={styles.salesDayBar}>
                      <i style={{ height: `${Math.max(pct, day.revenue > 0 ? 6 : 0)}%` }} />
                    </div>
                    <strong>{day.dayLabel || day.day}</strong>
                    <small>{day.orders} ord.</small>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.salesCardHeader}>
            <p className={styles.cardTitle}>Siguientes acciones</p>
            <span>Operación</span>
          </div>
          {loading ? (
            <EmptyState styles={styles}>Cargando recomendaciones...</EmptyState>
          ) : actions.length === 0 ? (
            <EmptyState styles={styles}>Sin alertas por ahora. Mantén el registro de POS al día.</EmptyState>
          ) : (
            <div className={styles.salesActionList}>
              {actions.map((action) => (
                <div key={action.title} className={styles.salesAction}>
                  <strong>{action.title}</strong>
                  <p>{action.copy}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.grid2} style={{ alignItems: "start", marginBottom: 20 }}>
        <div className={styles.card}>
          <div className={styles.salesCardHeader}>
            <p className={styles.cardTitle}>Horas pico</p>
            <span>30 días</span>
          </div>
          {loading ? (
            <EmptyState styles={styles}>Cargando...</EmptyState>
          ) : (
            <BarList
              styles={styles}
              items={peakHours}
              max={maxHour}
              getLabel={(h) => fmtHour(h.hour)}
              getValue={(h) => h.count}
            />
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.salesCardHeader}>
            <p className={styles.cardTitle}>Proteínas más pedidas</p>
            <span>30 días</span>
          </div>
          {loading ? (
            <EmptyState styles={styles}>Cargando...</EmptyState>
          ) : (
            <BarList
              styles={styles}
              items={topProteins}
              max={maxProtein}
              getLabel={(p, i) => `${i + 1}. ${PROTEIN_LABEL[p._id] || p._id}`}
              getValue={(p) => p.count}
            />
          )}
        </div>
      </div>

      <div className={styles.salesGridMain}>
        <div className={styles.card}>
          <div className={styles.salesCardHeader}>
            <p className={styles.cardTitle}>Top productos POS</p>
            <span>Unidades e ingreso</span>
          </div>
          {loading ? (
            <EmptyState styles={styles}>Cargando...</EmptyState>
          ) : (
            <BarList
              styles={styles}
              items={topPosItems}
              max={maxPOS}
              getLabel={(p, i) => `${i + 1}. ${p._id || "Sin nombre"}`}
              getValue={(p) => p.count}
              getMeta={(p) => `${p.count} · ${fmtMXN(p.revenue).replace(" MXN", "")}`}
              valueWidth={92}
            />
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.salesCardHeader}>
            <p className={styles.cardTitle}>Ventas por cajero</p>
            <span>POS pagado</span>
          </div>
          {loading ? (
            <EmptyState styles={styles}>Cargando...</EmptyState>
          ) : (
            <BarList
              styles={styles}
              items={cashierSales}
              max={maxCashierRevenue}
              getLabel={(c, i) => `${i + 1}. ${c.name || "Sin asignar"}`}
              getValue={(c) => c.revenue ?? 0}
              getMeta={(c) => `${fmtMXN(c.revenue).replace(" MXN", "")} · ${c.count}`}
              valueWidth={104}
            />
          )}
        </div>
      </div>

      <div className={styles.salesMixGrid}>
        <div className={styles.card}>
          <p className={styles.cardTitle}>Canal de venta</p>
          {loading ? <EmptyState styles={styles}>Cargando...</EmptyState> : (
            <div className={styles.salesMixList}>
              {sourceMix.map((item) => {
                const pct = sourceTotal ? Math.round((item.count / sourceTotal) * 100) : 0;
                return (
                  <div key={item._id || "unknown"} className={styles.salesMixItem}>
                    <span>{SOURCE_LABEL[item._id] || item._id || "Sin canal"}</span>
                    <strong>{pct}%</strong>
                    <small>{item.count} órdenes · {fmtMXN(item.revenue).replace(" MXN", "")}</small>
                  </div>
                );
              })}
              {sourceMix.length === 0 && <EmptyState styles={styles}>Sin ventas en el periodo.</EmptyState>}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <p className={styles.cardTitle}>Entrega</p>
          {loading ? <EmptyState styles={styles}>Cargando...</EmptyState> : (
            <div className={styles.salesMixList}>
              {fulfillmentMix.map((item) => {
                const pct = fulfillmentTotal ? Math.round((item.count / fulfillmentTotal) * 100) : 0;
                return (
                  <div key={item._id || "unknown"} className={styles.salesMixItem}>
                    <span>{FULFILLMENT_LABEL[item._id] || item._id || "Sin entrega"}</span>
                    <strong>{pct}%</strong>
                    <small>{item.count} órdenes</small>
                  </div>
                );
              })}
              {fulfillmentMix.length === 0 && <EmptyState styles={styles}>Sin datos de entrega.</EmptyState>}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <p className={styles.cardTitle}>Método de pago</p>
          {loading ? <EmptyState styles={styles}>Cargando...</EmptyState> : (
            <div className={styles.salesMixList}>
              {paymentMethods.map((item) => {
                const pct = paymentTotal ? Math.round(((item.revenue ?? 0) / paymentTotal) * 100) : 0;
                return (
                  <div key={item._id || "unknown"} className={styles.salesMixItem}>
                    <span>{PAYMENT_LABEL[item._id] || item._id || "Sin método"}</span>
                    <strong>{pct}%</strong>
                    <small>{fmtMXN(item.revenue).replace(" MXN", "")} · {item.count} órdenes</small>
                  </div>
                );
              })}
              {paymentMethods.length === 0 && <EmptyState styles={styles}>Sin pagos en el periodo.</EmptyState>}
            </div>
          )}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.salesCardHeader}>
          <p className={styles.cardTitle}>Cómo nos conocieron</p>
          <span>Capturado en POS</span>
        </div>
        {loading ? (
          <EmptyState styles={styles}>Cargando...</EmptyState>
        ) : (
          <BarList
            styles={styles}
            items={referralSources}
            max={maxReferral}
            getLabel={(r) => REFERRAL_SOURCE_LABELS[r._id] || r._id || "Sin fuente"}
            getValue={(r) => r.count}
          />
        )}
      </div>
    </div>
  );
}
