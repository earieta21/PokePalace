import { useState, useEffect, useContext, useCallback } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import { downloadCSV } from "../../utils/csv";
import ui from "./FinancePage.module.css";

const CATEGORIES = [
  { name: "Ingredientes",  icon: "🥑" },
  { name: "Limpieza",      icon: "🧼" },
  { name: "Empaque",       icon: "🥡" },
  { name: "Renta",         icon: "🏠" },
  { name: "Servicios",     icon: "💡" },
  { name: "Nómina",        icon: "👥" },
  { name: "Marketing",     icon: "📣" },
  { name: "Mantenimiento", icon: "🔧" },
  { name: "Otros",         icon: "📦" },
];
const categoryIcon = (name) => CATEGORIES.find((c) => c.name === name)?.icon || "📦";

const PERIODS = [
  { id: "semana",   label: "Esta semana",  icon: "📅", hint: "De lunes a hoy" },
  { id: "mes",      label: "Este mes",     icon: "🗓️", hint: "Del día 1 a hoy" },
  { id: "anterior", label: "Mes anterior", icon: "⏮",  hint: "El mes completo" },
];

function getRange(period) {
  const now = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  if (period === "semana") {
    const start = new Date(now);
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    start.setHours(0, 0, 0, 0);
    return { from: fmt(start), to: fmt(now) };
  }
  if (period === "anterior") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end   = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(start), to: fmt(end) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: fmt(start), to: fmt(now) };
}

const fmtMXN = (n) => `$${(n ?? 0).toLocaleString("es-MX")}`;
const today  = () => new Date().toISOString().slice(0, 10);

export default function FinancePage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [period, setPeriod]   = useState("mes");
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [notice, setNotice]   = useState("");
  const [showGuide, setShowGuide] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    category: "Ingredientes", description: "", amount: "", date: today(),
  });
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const { from, to } = getRange(period);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get(`/api/staff/expenses/summary?from=${from}&to=${to}`),
      api.get(`/api/staff/expenses?from=${from}&to=${to}`),
    ])
      .then(([s, e]) => { setSummary(s); setExpenses(e.expenses ?? []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken, from, to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const closeForm = () => {
    setShowForm(false);
    setForm({ category: "Ingredientes", description: "", amount: "", date: today() });
    setFormError("");
  };

  const handleAdd = async () => {
    if (!form.description.trim()) return setFormError("Escribe una descripción.");
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) return setFormError("Ingresa un monto válido.");
    setFormError(""); setSaving(true);
    try {
      const { expense } = await api.post("/api/staff/expenses", { ...form, amount: amt });
      setExpenses((prev) => [expense, ...prev]);
      setSummary((prev) => prev
        ? { ...prev, expenses: prev.expenses + amt, profit: prev.profit - amt }
        : prev
      );
      setNotice(`Gasto de ${fmtMXN(amt)} registrado en ${form.category}.`);
      closeForm();
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    const exp = expenses.find((e) => e._id === id);
    setConfirmDel(null);
    try {
      await api.delete(`/api/staff/expenses/${id}`);
      setExpenses((prev) => prev.filter((e) => e._id !== id));
      if (exp) {
        setSummary((prev) => prev
          ? { ...prev, expenses: prev.expenses - exp.amount, profit: prev.profit + exp.amount }
          : prev
        );
        setNotice(`Se eliminó el gasto "${exp.description}".`);
      }
    } catch (e) { setError(e.message); }
  };

  const margin = summary?.revenue > 0
    ? ((summary.profit / summary.revenue) * 100).toFixed(1)
    : null;

  function exportCSV() {
    const rows = [
      ["Resumen", `${from} a ${to}`],
      ["Ingresos", summary?.revenue ?? 0],
      ["Gastos", summary?.expenses ?? 0],
      ["Ganancia neta", summary?.profit ?? 0],
      ["Órdenes pagadas", summary?.orderCount ?? 0],
      [],
      ["Fecha", "Categoría", "Descripción", "Monto", "Origen"],
      ...expenses.map((e) => [e.date, e.category, e.description, e.amount, e.source === "inventario" ? "Inventario" : "Manual"]),
    ];
    downloadCSV(`finanzas_${from}_a_${to}.csv`, rows);
  }

  const maxCatAmt = summary?.byCategory
    ? Math.max(...Object.values(summary.byCategory), 1)
    : 1;

  const isLoss = !loading && (summary?.profit ?? 0) < 0;

  return (
    <div className={ui.financeRoot}>
      <div className={`${styles.pageHeader} ${ui.pageHeader}`}>
        <div>
          <h1 className={styles.pageTitle}>Finanzas</h1>
          <p className={styles.pageSubtitle}>Revisa ingresos, gastos y ganancia — las compras de inventario se anotan solas.</p>
        </div>
        <div className={ui.headerActions}>
          <button className={styles.btnGhost} onClick={() => setShowGuide((visible) => !visible)}>
            ? Cómo funciona
          </button>
          <button className={styles.btnGhost} onClick={load} title="Volver a cargar los datos">↻ Actualizar</button>
          <button className={styles.btnGhost} onClick={exportCSV} disabled={loading} title="Descargar el período actual">
            ↓ Exportar
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => (showForm ? closeForm() : setShowForm(true))}
          >
            {showForm ? "Cerrar formulario" : "+ Registrar gasto"}
          </button>
        </div>
      </div>

      {showGuide && (
        <section className={ui.guide} aria-label="Guía rápida de finanzas">
          <div className={ui.guideIntro}>
            <span className={ui.guideEyebrow}>Guía rápida</span>
            <strong>Tus finanzas en tres pasos</strong>
            <button type="button" onClick={() => setShowGuide(false)} aria-label="Ocultar guía">×</button>
          </div>
          <div className={ui.guideSteps}>
            <div className={ui.guideStep}><span>1</span><p><strong>Elige el período</strong>Semana o mes que quieres revisar.</p></div>
            <div className={ui.guideStep}><span>2</span><p><strong>Lee tus números</strong>Ingresos, gastos y ganancia neta.</p></div>
            <div className={ui.guideStep}><span>3</span><p><strong>Registra gastos manuales</strong>Renta, luz, gas… lo del inventario se anota solo.</p></div>
          </div>
        </section>
      )}

      {notice && (
        <div className={ui.successNotice} role="status">
          <span>✓</span>{notice}
          <button type="button" onClick={() => setNotice("")} aria-label="Cerrar notificación">×</button>
        </div>
      )}

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {/* ── Add expense form ── */}
      {showForm && (
        <div className={`${styles.card} ${ui.actionPanel}`}>
          <p className={styles.cardTitle}>Registrar gasto manual</p>

          {formError && (
            <p style={{ color: "red", fontSize: 12, marginBottom: 12 }}>{formError}</p>
          )}

          <div className={ui.formStep}>
            <div className={ui.stepHeading}>
              <span>1</span>
              <div><strong>Elige la categoría</strong><small>¿De qué tipo es este gasto?</small></div>
            </div>
            <div className={ui.categoryPicker}>
              {CATEGORIES.map((category) => (
                <button
                  key={category.name}
                  type="button"
                  aria-pressed={form.category === category.name}
                  onClick={() => setForm((previous) => ({ ...previous, category: category.name }))}
                >
                  <span>{category.icon}</span>{category.name}
                </button>
              ))}
            </div>
          </div>

          <div className={ui.formStep}>
            <div className={ui.stepHeading}>
              <span>2</span>
              <div><strong>Captura los datos</strong><small>Qué se pagó, cuánto y cuándo.</small></div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Descripción *</label>
              <input className={styles.input}
                placeholder="Ej: CFE agosto, Gas, Renta del local…"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.label}>Monto (MXN) *</label>
                <input className={styles.input} type="number" min="0" step="0.01" placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.label}>Fecha</label>
                <input className={styles.input} type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className={ui.formActions}>
            <button className={styles.btnPrimary} onClick={handleAdd} disabled={saving} type="button">
              {saving ? "Guardando…" : "Agregar gasto"}
            </button>
            <button className={styles.btnGhost} type="button" onClick={closeForm}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Period picker ── */}
      <section className={ui.sectionsBlock}>
        <div className={ui.sectionTitle}>
          <div><span>Paso 1</span><strong>¿Qué período quieres ver?</strong></div>
          <small>{from} → {to}</small>
        </div>
        <div className={ui.periodGrid}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              className={period === p.id ? ui.periodActive : ""}
              onClick={() => setPeriod(p.id)}
            >
              <span className={ui.periodIcon}>{p.icon}</span>
              <span className={ui.periodText}>
                <strong>{p.label}</strong>
                <small>{p.hint}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── KPI cards ── */}
      <div className={ui.summaryGrid}>
        <div>
          <span className={ui.summaryIcon}>$</span>
          <span><small>Ingresos</small><strong>{loading ? "—" : fmtMXN(summary?.revenue)}</strong><em>{summary?.orderCount ?? 0} órdenes pagadas</em></span>
        </div>
        <div>
          <span className={ui.summaryIcon}>−</span>
          <span><small>Gastos</small><strong>{loading ? "—" : fmtMXN(summary?.expenses)}</strong><em>{expenses.length} movimiento{expenses.length !== 1 ? "s" : ""}</em></span>
        </div>
        <div className={isLoss ? ui.warningSummary : ""}>
          <span className={ui.summaryIcon}>{isLoss ? "!" : "="}</span>
          <span><small>Ganancia neta</small><strong>{loading ? "—" : fmtMXN(summary?.profit)}</strong><em>{isLoss ? "⚠ Pérdida en el período" : "Antes de impuestos"}</em></span>
        </div>
        <div>
          <span className={ui.summaryIcon}>%</span>
          <span><small>Margen</small><strong>{loading ? "—" : (margin != null ? `${margin}%` : "—")}</strong><em>Sobre ingresos</em></span>
        </div>
      </div>

      {/* ── Category breakdown ── */}
      <div className={`${styles.card} ${ui.breakdownCard}`}>
        <p className={styles.cardTitle}>Gastos por categoría</p>
        {loading ? (
          <p style={{ color: "var(--p-muted)", fontSize: 13 }}>Cargando…</p>
        ) : !summary?.byCategory || Object.keys(summary.byCategory).length === 0 ? (
          <p style={{ color: "var(--p-muted)", fontSize: 13, paddingTop: 8 }}>Sin gastos en este período.</p>
        ) : (
          <div className={styles.barChart} style={{ marginTop: 10 }}>
            {Object.entries(summary.byCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, amt]) => (
                <div key={cat} className={styles.barRow}>
                  <span className={styles.barLabel}>{categoryIcon(cat)} {cat}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${(amt / maxCatAmt) * 100}%` }} />
                  </div>
                  <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10.5, color: "var(--p-muted)", width: 110, textAlign: "right", whiteSpace: "nowrap", flexShrink: 0 }}>
                    ${amt.toLocaleString("es-MX")}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ── Expense list ── */}
      <section className={ui.filterPanel}>
        <div className={ui.listHeading}>
          <div>
            <span>Paso 2</span>
            <h2>Movimientos del período</h2>
            <p>{expenses.length} gasto{expenses.length !== 1 ? "s" : ""} registrado{expenses.length !== 1 ? "s" : ""} · los marcados con 📦 vienen del inventario</p>
          </div>
        </div>
      </section>

      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${ui.financeTable}`}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Categoría</th>
              <th>Descripción</th>
              <th>Monto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className={ui.loadingCell}>Cargando movimientos…</td></tr>
            ) : expenses.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className={ui.emptyState}>
                    <span>$</span>
                    <strong>Sin gastos en este período</strong>
                    <p>Registra un gasto manual o recibe mercancía en Inventario.</p>
                    <button type="button" className={styles.btnPrimary} onClick={() => setShowForm(true)}>
                      + Registrar gasto
                    </button>
                  </div>
                </td>
              </tr>
            ) : expenses.map((e) => (
              <tr key={e._id}>
                <td className={styles.tdMuted}>{e.date}</td>
                <td>
                  <span className={`${styles.badge} ${styles.badgeGray}`}>{categoryIcon(e.category)} {e.category}</span>
                  {e.source === "inventario" && <span className={ui.sourceBadge}>📦 Inventario</span>}
                </td>
                <td style={{ fontWeight: 500 }}>{e.description}</td>
                <td className={styles.tdMono}>${e.amount.toLocaleString("es-MX")} MXN</td>
                <td>
                  {confirmDel === e._id ? (
                    <div className={ui.confirmDelete}>
                      <button onClick={() => handleDelete(e._id)}>Sí</button>
                      <button onClick={() => setConfirmDel(null)}>No</button>
                    </div>
                  ) : (
                    <button className={ui.deleteButton} onClick={() => setConfirmDel(e._id)} aria-label="Eliminar gasto" title="Eliminar gasto">×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
