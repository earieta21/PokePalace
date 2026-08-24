import { useState, useEffect, useContext, useCallback } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import ui from "./FiscalPage.module.css";

const fmtMXN = (n) => `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const METODO_LABEL = {
  cash: "Efectivo",
  card_terminal: "Tarjeta (terminal)",
  online: "Pago en línea (Clip)",
  pay_at_pickup: "Pagar al recoger",
};

const MES_LABEL = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// El negocio tiene obligaciones ante el SAT desde su alta: nov 2025.
function availableMonths() {
  const months = [];
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  while (year > 2025 || (year === 2025 && month >= 11)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return months;
}

const monthLabel = (key) => {
  const [year, month] = key.split("-").map(Number);
  return `${MES_LABEL[month]} ${year}`;
};

export default function FiscalPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const months = availableMonths();
  const [month, setMonth]     = useState(months[0]);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/api/staff/fiscal?month=${month}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken, month]);

  useEffect(() => { load(); }, [load]);

  const dueDate = data ? new Date(`${data.vencimiento}T12:00:00`) : null;
  const daysToDue = dueDate ? Math.ceil((dueDate - Date.now()) / 86400000) : null;

  return (
    <div className={ui.fiscalRoot}>
      <div className={`${styles.pageHeader} ${ui.pageHeader}`}>
        <div>
          <h1 className={styles.pageTitle}>Fiscal</h1>
          <p className={styles.pageSubtitle}>
            Tu paquete del mes para el SAT — RESICO, restaurante de comida para llevar.
          </p>
        </div>
        <div className={ui.headerActions}>
          <select className={ui.monthSelect} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mes a consultar">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button className={styles.btnGhost} onClick={load} title="Volver a cargar">↻ Actualizar</button>
        </div>
      </div>

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p className={ui.loadingText}>Calculando el mes…</p>}

      {data && !loading && (
        <>
          <div className={ui.deadlineBanner}>
            <span>🗓️</span>
            <span>
              Esta declaración vence el <strong>17 de {MES_LABEL[Number(data.vencimiento.slice(5, 7))]} de {data.vencimiento.slice(0, 4)}</strong>
              {daysToDue != null && daysToDue >= 0 ? ` — faltan ${daysToDue} día${daysToDue !== 1 ? "s" : ""}` : ""}
            </span>
          </div>

          <div className={ui.kpiGrid}>
            <div className={ui.kpiCard}>
              <small>Ingresos cobrados</small>
              <strong>{fmtMXN(data.ingresos.conIva)}</strong>
              <em>{data.ordenesCobradas} órdenes pagadas (IVA incluido)</em>
            </div>
            <div className={ui.kpiCard}>
              <small>IVA cobrado (16%)</small>
              <strong>{fmtMXN(data.ingresos.ivaTrasladado)}</strong>
              <em>Sobre base de {fmtMXN(data.ingresos.base)}</em>
            </div>
            <div className={ui.kpiCard}>
              <small>ISR estimado ({(data.isr.tasa * 100).toFixed(1)}%)</small>
              <strong>{fmtMXN(data.isr.estimado)}</strong>
              <em>Tabla RESICO sobre ingresos sin IVA</em>
            </div>
            <div className={`${ui.kpiCard} ${ui.totalCard}`}>
              <small>Estimado a pagar</small>
              <strong>{fmtMXN(data.totalEstimado)}</strong>
              <em>ISR + IVA (sin acreditar facturas de compras)</em>
            </div>
          </div>

          <div className={ui.sectionTitle}>
            <span>Desglose</span>
            <strong>Ingresos por método de pago</strong>
          </div>
          <div className={ui.detailCard}>
            {Object.keys(data.ingresos.porMetodo).length === 0 ? (
              <p style={{ margin: 0, color: "var(--p-muted)", fontSize: 13 }}>Sin ventas cobradas este mes.</p>
            ) : (
              Object.entries(data.ingresos.porMetodo).map(([metodo, monto]) => (
                <div key={metodo} className={ui.detailRow}>
                  <span>{METODO_LABEL[metodo] || metodo}</span>
                  <strong>{fmtMXN(monto)}</strong>
                </div>
              ))
            )}
            <div className={ui.detailRow}>
              <span>Gastos registrados en el mes ({data.gastos.movimientos})</span>
              <strong>{fmtMXN(data.gastos.total)}</strong>
            </div>
          </div>

          <div className={ui.sectionTitle}>
            <span>Para no fallar</span>
            <strong>Recordatorios del mes</strong>
          </div>
          <div className={ui.notes}>
            <div className={`${ui.note} ${ui.noteWarn}`}>
              <span>⚠️</span>
              <span>
                Tus obligaciones corren desde noviembre 2025. Si algún mes anterior no se declaró
                (aunque sea en ceros), tu contador debe ponerlo al corriente — el SAT puede sacarte
                de RESICO por no declarar.
              </span>
            </div>
            {data.notas.map((nota, i) => (
              <div key={i} className={ui.note}><span>•</span><span>{nota}</span></div>
            ))}
          </div>

          <p className={ui.disclaimer}>
            Estimación informativa generada por la app con tus ventas y gastos registrados; no es un
            cálculo oficial ni sustituye a tu contador.
          </p>
        </>
      )}
    </div>
  );
}
