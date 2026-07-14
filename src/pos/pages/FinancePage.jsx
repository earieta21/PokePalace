import { useState, useEffect, useContext, useCallback } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import { downloadCSV } from "../../utils/csv";

const CATEGORIES = [
  "Ingredientes", "Renta", "Servicios", "Nómina",
  "Empaque", "Marketing", "Mantenimiento", "Otros",
];

const PERIODS = [
  { id: "semana",   label: "Esta semana" },
  { id: "mes",      label: "Este mes" },
  { id: "anterior", label: "Mes anterior" },
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

const fmtMXN = (n) => `$${(n ?? 0).toLocaleString("es-MX")} MXN`;
const today  = () => new Date().toISOString().slice(0, 10);

export default function FinancePage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [period, setPeriod]   = useState("mes");
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

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
      setForm((f) => ({ ...f, description: "", amount: "" }));
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    const exp = expenses.find((e) => e._id === id);
    setConfirmDel(null);
    try {
      await api.delete(`/api/staff/expenses/${id}`);
      setExpenses((prev) => prev.filter((e) => e._id !== id));
      if (exp) setSummary((prev) => prev
        ? { ...prev, expenses: prev.expenses - exp.amount, profit: prev.profit + exp.amount }
        : prev
      );
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
      ["Fecha", "Categoría", "Descripción", "Monto"],
      ...expenses.map((e) => [e.date, e.category, e.description, e.amount]),
    ];
    downloadCSV(`finanzas_${from}_a_${to}.csv`, rows);
  }

  const maxCatAmt = summary?.byCategory
    ? Math.max(...Object.values(summary.byCategory), 1)
    : 1;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Finanzas</h1>
          <p className={styles.pageSubtitle}>{from} → {to}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.btnGhost} onClick={load}>Actualizar</button>
          <button className={styles.btnGhost} onClick={exportCSV} disabled={loading}>⬇ CSV</button>
        </div>
      </div>

      {/* Period tabs */}
      <div style={{ display: "flex", gap: 3, background: "rgba(0,0,0,0.04)", borderRadius: 8, padding: 3, marginBottom: 22, width: "fit-content" }}>
        {PERIODS.map((p) => (
          <button key={p.id} type="button" onClick={() => setPeriod(p.id)}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "none",
              background: period === p.id ? "var(--p-surface)" : "transparent",
              color: period === p.id ? "var(--p-ink)" : "var(--p-muted)",
              fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              boxShadow: period === p.id ? "var(--p-shadow)" : "none",
              fontFamily: "Inter, sans-serif", transition: "background 130ms",
            }}
          >{p.label}</button>
        ))}
      </div>

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {/* KPI cards */}
      <div className={styles.statsRow} style={{ marginBottom: 24 }}>
        {[
          { label: "Ingresos",     value: loading ? "—" : fmtMXN(summary?.revenue),  sub: `${summary?.orderCount ?? 0} órdenes pagadas`, accent: false },
          { label: "Gastos",       value: loading ? "—" : fmtMXN(summary?.expenses), sub: "Registrados",          accent: false },
          { label: "Ganancia Neta",value: loading ? "—" : fmtMXN(summary?.profit),   sub: summary?.profit < 0 ? "⚠ Pérdida" : "Antes de impuestos", accent: true },
          { label: "Margen",       value: loading ? "—" : (margin != null ? `${margin}%` : "—"), sub: "Sobre ingresos", accent: false },
        ].map(({ label, value, sub, accent }) => (
          <div key={label} className={styles.statCard}>
            <p className={styles.statLabel}>{label}</p>
            <p className={`${styles.statValue} ${accent ? styles.statAccent : ""}`} style={{ fontSize: 16, lineHeight: 1.3, wordBreak: "break-word" }}>
              {value}
            </p>
            <p className={styles.statSub}>{sub}</p>
          </div>
        ))}
      </div>

      <div className={styles.grid2} style={{ alignItems: "start", gap: 20, marginBottom: 24 }}>

        {/* ── Add expense form ── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Registrar Gasto</p>

          <div className={styles.formGroup}>
            <label className={styles.label}>Categoría</label>
            <select className={styles.select} value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Descripción</label>
            <input className={styles.input}
              placeholder="Ej: Salmón 2 kg, CFE agosto, Gas…"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label className={styles.label}>Monto (MXN)</label>
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

          {formError && <p style={{ color: "red", fontSize: 12, margin: "8px 0 0" }}>{formError}</p>}

          <button className={styles.btnPrimary} style={{ width: "100%", marginTop: 16 }}
            onClick={handleAdd} disabled={saving} type="button">
            {saving ? "Guardando…" : "+ Agregar gasto"}
          </button>
        </div>

        {/* ── Category breakdown ── */}
        <div className={styles.card}>
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
                    <span className={styles.barLabel}>{cat}</span>
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
      </div>

      {/* ── Expense list ── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
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
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--p-muted)" }}>Cargando…</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--p-muted)" }}>Sin gastos registrados en este período</td></tr>
            ) : expenses.map((e) => (
              <tr key={e._id}>
                <td className={styles.tdMuted}>{e.date}</td>
                <td><span className={`${styles.badge} ${styles.badgeGray}`}>{e.category}</span></td>
                <td style={{ fontWeight: 500 }}>{e.description}</td>
                <td className={styles.tdMono}>${e.amount.toLocaleString("es-MX")} MXN</td>
                <td>
                  {confirmDel === e._id ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button onClick={() => handleDelete(e._id)}
                        style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: "#c0392b", color: "#fff", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
                        Sí
                      </button>
                      <button onClick={() => setConfirmDel(null)}
                        style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: "transparent", color: "var(--p-muted)", border: "1px solid var(--p-border)", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>
                        No
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDel(e._id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--p-muted)", fontSize: 18, padding: "0 4px", lineHeight: 1, transition: "color 120ms" }}
                      onMouseEnter={(ev) => (ev.currentTarget.style.color = "#c0392b")}
                      onMouseLeave={(ev) => (ev.currentTarget.style.color = "var(--p-muted)")}
                      aria-label="Eliminar gasto">×</button>
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
