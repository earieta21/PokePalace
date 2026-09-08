import { useState, useEffect, useContext, useCallback } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import { downloadCSV } from "../../utils/csv";
import { tijuanaDateKey } from "../../utils/date";
import ui from "./FinancePage.module.css";

const CATEGORIES = [
  { name: "Ingredientes",  icon: "🥑" },
  { name: "Bebidas",       icon: "🥤" },
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

const SOURCE_LABEL = {
  manual: "Manual",
  inventario: "Inventario",
  fijo: "Gasto fijo automático",
  nomina: "Nómina",
};

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
const today  = () => tijuanaDateKey();

// "2026-09-01" + "2026-09-07" → "1 – 7 sep". Se arma en UTC a propósito: el
// date-key ya viene resuelto en hora Tijuana desde el servidor, así que
// interpretarlo en la zona del navegador lo correría un día.
const weekLabel = (weekStart, weekEnd) => {
  const parse = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const day = (key) => parse(key).toLocaleDateString("es-MX", { day: "numeric", timeZone: "UTC" });
  const dayMonth = (key) => parse(key).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${day(weekStart)} – ${dayMonth(weekEnd)}`;
};

export default function FinancePage({ styles }) {
  const { staffToken, staffUser } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  // Configurar los gastos fijos y confirmar cuánto se pagó de nómina es
  // decisión de dueño/admin; un gerente los ve pero no los cambia. El
  // servidor lo vuelve a exigir — esto solo evita mostrar botones que
  // fallarían.
  const canManageFixed = staffUser?.role === "owner" || staffUser?.role === "admin";

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

  // Gastos fijos (se anotan solos) + nómina semanal (se confirma a mano)
  const [fixed, setFixed]         = useState([]);
  const [weeks, setWeeks]         = useState([]);
  const [fixedLoading, setFixedLoading] = useState(true);
  const [showFixedForm, setShowFixedForm] = useState(false);
  const [fixedForm, setFixedForm] = useState({ name: "", category: "Renta", amount: "", dayOfMonth: "1" });
  const [fixedError, setFixedError] = useState("");
  const [fixedSaving, setFixedSaving] = useState(false);
  const [editingFixed, setEditingFixed] = useState(null);
  const [payrollAmounts, setPayrollAmounts] = useState({}); // { weekStart: "8450" }
  const [payrollSaving, setPayrollSaving] = useState(null);

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

  const loadFixed = useCallback(() => {
    setFixedLoading(true);
    Promise.all([
      api.get("/api/staff/fixed-expenses"),
      api.get("/api/staff/fixed-expenses/payroll/weeks"),
    ])
      .then(([f, p]) => {
        setFixed(f.items ?? []);
        const list = p.weeks ?? [];
        setWeeks(list);
        // El monto calculado llega precargado y editable: si alguien olvidó
        // checar salida, el cálculo queda corto y hay que corregirlo.
        setPayrollAmounts(Object.fromEntries(
          list.filter((w) => !w.registered).map((w) => [w.weekStart, String(Math.round(w.total))])
        ));
      })
      .catch((e) => setError(e.message))
      .finally(() => setFixedLoading(false));
  }, [staffToken]);

  useEffect(() => { loadFixed(); }, [loadFixed]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const closeFixedForm = () => {
    setShowFixedForm(false);
    setEditingFixed(null);
    setFixedForm({ name: "", category: "Renta", amount: "", dayOfMonth: "1" });
    setFixedError("");
  };

  const startEditFixed = (item) => {
    setEditingFixed(item._id);
    setFixedForm({
      name: item.name,
      category: item.category,
      amount: String(item.amount),
      dayOfMonth: String(item.dayOfMonth),
    });
    setShowFixedForm(true);
    setFixedError("");
  };

  const saveFixed = async () => {
    const amount = parseFloat(fixedForm.amount);
    const dayOfMonth = parseInt(fixedForm.dayOfMonth, 10);
    if (!fixedForm.name.trim()) return setFixedError("Ponle un nombre (ej. Renta del local).");
    if (!Number.isFinite(amount) || amount <= 0) return setFixedError("Ingresa un monto válido.");
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return setFixedError("El día debe estar entre 1 y 31.");
    }
    setFixedError("");
    setFixedSaving(true);
    try {
      const payload = { name: fixedForm.name.trim(), category: fixedForm.category, amount, dayOfMonth };
      if (editingFixed) {
        await api.patch(`/api/staff/fixed-expenses/${editingFixed}`, payload);
        setNotice(`Se actualizó "${payload.name}".`);
      } else {
        const r = await api.post("/api/staff/fixed-expenses", payload);
        setNotice(r.registeredNow
          ? `"${payload.name}" quedó configurado y ya se anotó el gasto de este mes.`
          : `"${payload.name}" quedó configurado — se anotará solo el día ${dayOfMonth} de cada mes.`);
      }
      closeFixedForm();
      loadFixed();
      load();
    } catch (e) { setFixedError(e.message); }
    finally { setFixedSaving(false); }
  };

  const toggleFixed = async (item) => {
    try {
      await api.patch(`/api/staff/fixed-expenses/${item._id}`, { active: !item.active });
      setNotice(item.active
        ? `"${item.name}" pausado — dejará de anotarse.`
        : `"${item.name}" reactivado.`);
      loadFixed();
    } catch (e) { setError(e.message); }
  };

  const removeFixed = async (item) => {
    try {
      await api.delete(`/api/staff/fixed-expenses/${item._id}`);
      setNotice(`Se quitó "${item.name}" de los gastos fijos.`);
      loadFixed();
    } catch (e) { setError(e.message); }
  };

  const registerPayroll = async (week) => {
    const amount = parseFloat(payrollAmounts[week.weekStart]);
    if (!Number.isFinite(amount) || amount <= 0) {
      return setError("Captura el monto de la nómina antes de registrarla.");
    }
    setPayrollSaving(week.weekStart);
    setError("");
    try {
      await api.post("/api/staff/fixed-expenses/payroll/register", {
        weekStart: week.weekStart,
        amount,
      });
      setNotice(`Nómina de la semana ${week.weekStart} registrada: ${fmtMXN(amount)}.`);
      loadFixed();
      load();
    } catch (e) { setError(e.message); }
    finally { setPayrollSaving(null); }
  };

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

  // Todas las semanas pendientes (para poder ponerse al corriente de un
  // jalón) más las 2 últimas ya registradas, como confirmación. `weeks` viene
  // de la más reciente a la más vieja.
  let registeredShown = 0;
  const shownWeeks = weeks.filter((week) => {
    if (!week.registered) return true;
    registeredShown += 1;
    return registeredShown <= 2;
  });
  const pendingWeeks = weeks.filter((week) => !week.registered).length;

  function exportCSV() {
    const rows = [
      ["Resumen", `${from} a ${to}`],
      ["Ingresos", summary?.revenue ?? 0],
      ["Gastos", summary?.expenses ?? 0],
      ["Ganancia neta", summary?.profit ?? 0],
      ["Órdenes pagadas", summary?.orderCount ?? 0],
      [],
      ["Fecha", "Categoría", "Descripción", "Monto", "Origen"],
      ...expenses.map((e) => [e.date, e.category, e.description, e.amount, SOURCE_LABEL[e.source] ?? "Manual"]),
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

      {/* ── Gastos fijos y nómina ── */}
      <div className={`${styles.card} ${ui.breakdownCard}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <p className={styles.cardTitle}>Gastos fijos y nómina</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--p-muted)" }}>
              Los gastos fijos se anotan solos cada mes. La nómina se confirma cada semana porque el monto cambia según las horas checadas.
            </p>
          </div>
          {canManageFixed && (
            <button
              className={styles.btnGhost}
              type="button"
              onClick={() => (showFixedForm ? closeFixedForm() : setShowFixedForm(true))}
            >
              {showFixedForm ? "Cancelar" : "+ Gasto fijo"}
            </button>
          )}
        </div>

        {showFixedForm && canManageFixed && (
          <div style={{ marginTop: 14, padding: 14, border: "1px solid var(--p-border)", borderRadius: 10 }}>
            {fixedError && <p style={{ color: "red", fontSize: 12, marginBottom: 10 }}>{fixedError}</p>}
            <div className={styles.formGroup}>
              <label className={styles.label}>¿Qué gasto es? *</label>
              <input
                className={styles.input}
                placeholder="Ej: Renta del local, Luz, Internet…"
                value={fixedForm.name}
                onChange={(e) => setFixedForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className={ui.categoryPicker} style={{ marginBottom: 12 }}>
              {CATEGORIES.map((category) => (
                <button
                  key={category.name}
                  type="button"
                  aria-pressed={fixedForm.category === category.name}
                  onClick={() => setFixedForm((f) => ({ ...f, category: category.name }))}
                >
                  <span>{category.icon}</span>{category.name}
                </button>
              ))}
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.label}>Monto cada mes (MXN) *</label>
                <input
                  className={styles.input} type="number" min="0" step="0.01" placeholder="21600"
                  value={fixedForm.amount}
                  onChange={(e) => setFixedForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                <label className={styles.label}>Día del mes en que se anota *</label>
                <input
                  className={styles.input} type="number" min="1" max="31" placeholder="1"
                  value={fixedForm.dayOfMonth}
                  onChange={(e) => setFixedForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
                />
              </div>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--p-muted)" }}>
              Si el día ya pasó este mes, el gasto se anota de una vez al guardar. En meses más cortos (día 31 en febrero) se usa el último día del mes.
            </p>
            <div className={ui.formActions} style={{ marginTop: 12 }}>
              <button className={styles.btnPrimary} type="button" onClick={saveFixed} disabled={fixedSaving}>
                {fixedSaving ? "Guardando…" : editingFixed ? "Guardar cambios" : "Agregar gasto fijo"}
              </button>
              <button className={styles.btnGhost} type="button" onClick={closeFixedForm}>Cancelar</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--p-muted)" }}>
            Cada mes, automático
          </p>
          {fixedLoading ? (
            <p style={{ color: "var(--p-muted)", fontSize: 13 }}>Cargando…</p>
          ) : fixed.length === 0 ? (
            <p style={{ color: "var(--p-muted)", fontSize: 12.5 }}>
              Todavía no hay gastos fijos configurados{canManageFixed ? " — agrega la renta con el botón de arriba." : "."}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {fixed.map((item) => (
                <div
                  key={item._id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    padding: "9px 12px", borderRadius: 8, background: "var(--p-bg)",
                    opacity: item.active ? 1 : 0.55,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 140 }}>
                    {categoryIcon(item.category)} {item.name}
                  </span>
                  <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12.5 }}>{fmtMXN(item.amount)}</span>
                  <span style={{ fontSize: 11, color: "var(--p-muted)" }}>día {item.dueDay}</span>
                  <span style={{ fontSize: 11, color: item.registeredThisPeriod ? "var(--p-g2, #2d6a4f)" : "var(--p-muted)" }}>
                    {!item.active
                      ? "pausado"
                      : item.registeredThisPeriod
                        ? `✓ anotado el ${item.registeredDate}`
                        : "pendiente este mes"}
                  </span>
                  {canManageFixed && (
                    <span style={{ display: "flex", gap: 4 }}>
                      <button className={styles.btnGhost} type="button" onClick={() => startEditFixed(item)} style={{ padding: "4px 10px", fontSize: 11 }}>
                        Editar
                      </button>
                      <button className={styles.btnGhost} type="button" onClick={() => toggleFixed(item)} style={{ padding: "4px 10px", fontSize: 11 }}>
                        {item.active ? "Pausar" : "Activar"}
                      </button>
                      <button className={ui.deleteButton} type="button" onClick={() => removeFixed(item)} aria-label={`Quitar ${item.name}`} title="Quitar de gastos fijos">×</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 18 }}>
          <p style={{ margin: "0 0 8px", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--p-muted)" }}>
            Nómina por semana
            {pendingWeeks > 0 && ` · ${pendingWeeks} pendiente${pendingWeeks !== 1 ? "s" : ""}`}
          </p>
          {fixedLoading ? (
            <p style={{ color: "var(--p-muted)", fontSize: 13 }}>Calculando…</p>
          ) : weeks.length === 0 ? (
            <p style={{ color: "var(--p-muted)", fontSize: 12.5 }}>Todavía no hay semanas cerradas.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {shownWeeks.map((week) => (
                <div
                  key={week.weekStart}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    padding: "9px 12px", borderRadius: 8,
                    background: week.registered ? "var(--p-bg)" : "rgba(212, 160, 23, 0.08)",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 130 }}>
                    👥 Semana {weekLabel(week.weekStart, week.weekEnd)}
                  </span>
                  {week.registered ? (
                    <span style={{ fontSize: 12, color: "var(--p-g2, #2d6a4f)" }}>
                      ✓ registrada · {fmtMXN(week.registeredAmount)}
                    </span>
                  ) : (
                    <>
                      <span style={{ fontSize: 11, color: "var(--p-muted)" }}>
                        calculado {fmtMXN(Math.round(week.total))}
                      </span>
                      {canManageFixed ? (
                        <>
                          <input
                            className={styles.input}
                            type="number" min="0" step="0.01"
                            style={{ width: 110 }}
                            value={payrollAmounts[week.weekStart] ?? ""}
                            onChange={(e) => setPayrollAmounts((prev) => ({ ...prev, [week.weekStart]: e.target.value }))}
                            aria-label={`Monto de nómina de la semana ${week.weekStart}`}
                          />
                          <button
                            className={styles.btnPrimary}
                            type="button"
                            onClick={() => registerPayroll(week)}
                            disabled={payrollSaving === week.weekStart}
                            style={{ padding: "6px 12px", fontSize: 12 }}
                          >
                            {payrollSaving === week.weekStart ? "Guardando…" : "Registrar"}
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--p-muted)" }}>pendiente de registrar</span>
                      )}
                    </>
                  )}
                  {week.warnings?.length > 0 && !week.registered && (
                    <span style={{ flexBasis: "100%", fontSize: 11, color: "#8a6d1f" }}>
                      ⚠ {week.warnings.join(" ")} Revisa el monto antes de registrar.
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
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
                  {e.source === "fijo" && <span className={ui.sourceBadge}>🔁 Automático</span>}
                  {e.source === "nomina" && <span className={ui.sourceBadge}>👥 Nómina</span>}
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
