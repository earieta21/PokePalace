import { useState, useEffect, useContext, useMemo } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import ui from "./FiscalPage.module.css";
import { downloadCSV } from "../../utils/csv";
import { buildFiscalCSV, FISCAL_METHOD_LABELS, fiscalPlatformLabel } from "../../utils/fiscalExport.js";

const fmtMXN = (n) => `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const api = useMemo(() => createStaffApi(staffToken), [staffToken]);

  const months = availableMonths();
  const [month, setMonth]     = useState(months[0]);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.get(`/api/staff/fiscal?month=${month}`)
      .then((result) => { if (active) setData(result); })
      .catch((e) => { if (active) { setError(e.message); setData(null); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, month, refresh]);

  const currentData = data?.month === month ? data : null;
  const canExport = Boolean(currentData?.ingresos.grupos) && !loading;
  function exportReport(groupId = null) {
    if (!canExport) return;
    downloadCSV(`poke_palace_fiscal_${month}_${groupId || "completo"}.csv`, buildFiscalCSV(currentData, groupId));
  }

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
          <button className={styles.btnGhost} onClick={() => setRefresh((n) => n + 1)} title="Volver a cargar">↻ Actualizar</button>
          <button className={styles.btnGhost} onClick={() => exportReport()} disabled={!canExport}>Descargar resumen completo (CSV)</button>
        </div>
      </div>

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p className={ui.loadingText}>Calculando el mes…</p>}

      {currentData && !loading && (
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
              <small>IVA neto a pagar</small>
              <strong>{fmtMXN(data.iva.neto)}</strong>
              <em>{fmtMXN(data.iva.trasladado)} cobrado − {fmtMXN(data.iva.acreditable)} acreditado</em>
            </div>
            <div className={ui.kpiCard}>
              <small>ISR estimado ({(data.isr.tasa * 100).toFixed(1)}%)</small>
              <strong>{fmtMXN(data.isr.estimado)}</strong>
              <em>Tabla RESICO sobre ingresos sin IVA</em>
            </div>
            <div className={`${ui.kpiCard} ${ui.totalCard}`}>
              <small>Estimado a pagar</small>
              <strong>{fmtMXN(data.totalEstimado)}</strong>
              <em>ISR + IVA neto</em>
            </div>
          </div>

          {data.ingresos.grupos && (
            <>
              <div className={ui.sectionTitle}>
                <span>Para el contador</span>
                <strong>Reportes separados por forma de cobro</strong>
              </div>
              <p className={ui.reportHelp}>Los tres grupos integran el total general. Cada CSV identifica su alcance e incluye el resumen general y el detalle de sus ventas, sin duplicarlas entre grupos.</p>
              <div className={ui.reportGrid}>
                {data.ingresos.grupos.map((group) => (
                  <div key={group.id} className={ui.detailCard}>
                    <h2 className={ui.groupTitle}>{group.label}</h2>
                    <p className={ui.groupAmount}>{fmtMXN(group.total)}</p>
                    <p className={ui.reportHelp}>{group.ordenes} órdenes pagadas · IVA incluido</p>
                    {group.id === "delivery_app" && (
                      <>
                        {data.ingresos.porPlataforma.map((platform) => (
                          <div key={platform.id} className={ui.detailRow}>
                            <span>{fiscalPlatformLabel(platform.id)}</span>
                            <strong>{fmtMXN(platform.total)}</strong>
                          </div>
                        ))}
                        <p className={ui.reportHelp}>Ventas registradas en el sistema. Para conciliar depósitos, comisiones y retenciones, adjunta las liquidaciones de cada app.</p>
                      </>
                    )}
                    <button className={styles.btnGhost} type="button" aria-label={`Descargar reporte de ${group.label}`} onClick={() => exportReport(group.id)} disabled={!canExport}>Descargar CSV</button>
                  </div>
                ))}
              </div>
            </>
          )}

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
                  <span>{FISCAL_METHOD_LABELS[metodo] || metodo}</span>
                  <strong>{fmtMXN(monto)}</strong>
                </div>
              ))
            )}
            <div className={ui.detailRow}>
              <span>Gastos registrados en el mes ({data.gastos.movimientos})</span>
              <strong>{fmtMXN(data.gastos.total)}</strong>
            </div>
            <div className={ui.detailRow}>
              <span>Con factura (CFDI) — acreditan IVA</span>
              <strong>{data.gastos.conFactura} de {data.gastos.movimientos}</strong>
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
