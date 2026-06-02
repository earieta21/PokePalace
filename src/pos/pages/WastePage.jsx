import { useState, useEffect, useContext } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";

const REASONS = ["Demasiado maduro", "Caducado", "Sobrecocido", "Derramado", "Contaminado", "Quemado por congelación", "Otro"];
const UNITS   = ["kg", "pz", "L", "paq", "botellas", "manojos"];

export default function WastePage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [logs, setLogs]     = useState([]);
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState("");

  const [form, setForm] = useState({
    item: "", qty: "", unit: "kg", reason: REASONS[0], cost: "",
  });

  const load = () => {
    Promise.all([
      api.get("/api/staff/waste?limit=20"),
      api.get("/api/staff/waste/stats"),
    ])
      .then(([l, s]) => { setLogs(l.logs ?? []); setStats(s); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [staffToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.item || !form.qty) return;
    setSaving(true); setError("");
    try {
      const { log } = await api.post("/api/staff/waste", {
        item: form.item,
        qty: parseFloat(form.qty),
        unit: form.unit,
        reason: form.reason,
        cost: form.cost ? parseFloat(form.cost) : 0,
      });
      setLogs((prev) => [log, ...prev]);
      setForm({ item: "", qty: "", unit: "kg", reason: REASONS[0], cost: "" });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const f = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Registro de Merma</h1>
          <p className={styles.pageSubtitle}>Registra y reduce el desperdicio de alimentos</p>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Entradas de Hoy</p>
          <p className={styles.statValue}>{loading ? "—" : stats?.today ?? 0}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Costo de Hoy</p>
          <p className={styles.statValue}>{loading ? "—" : `$${(stats?.todayCost ?? 0).toFixed(2)}`}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Costo Total de Merma</p>
          <p className={styles.statValue}>{loading ? "—" : `$${(stats?.totalCost ?? 0).toFixed(2)}`}</p>
          <p className={styles.statSub}>Histórico</p>
        </div>
      </div>

      <div className={styles.grid2} style={{ alignItems: "start", marginBottom: 24 }}>
        {/* Form */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Registrar Nueva Merma</p>
          <form onSubmit={handleSubmit}>
            {saved && (
              <p style={{ color: "var(--p-g2)", fontSize: 13, fontWeight: 600, marginBottom: 12 }} role="status">
                ✓ Entrada registrada
              </p>
            )}
            {error && (
              <p style={{ color: "red", fontSize: 12, marginBottom: 12 }} role="alert">{error}</p>
            )}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Artículo</label>
                <input className={styles.input} placeholder="ej. Aguacate" value={form.item} onChange={f("item")} required />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Cantidad</label>
                <input className={styles.input} type="number" min="0" step="0.01" placeholder="0" value={form.qty} onChange={f("qty")} required />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Unidad</label>
                <select className={styles.select} value={form.unit} onChange={f("unit")}>
                  {UNITS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Costo ($)</label>
                <input className={styles.input} type="number" min="0" step="0.01" placeholder="0.00" value={form.cost} onChange={f("cost")} />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Motivo</label>
              <select className={styles.select} value={form.reason} onChange={f("reason")}>
                {REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <button className={styles.btnPrimary} type="submit" style={{ width: "100%" }} disabled={saving}>
              {saving ? "Guardando…" : "Registrar Entrada"}
            </button>
          </form>
        </div>

        {/* Recent entries */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Artículo</th><th>Cant.</th><th>Motivo</th><th>Costo</th><th>Cuándo</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--p-muted)" }}>Cargando…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--p-muted)" }}>Sin entradas aún</td></tr>
              ) : logs.map((row) => (
                <tr key={row._id}>
                  <td style={{ fontWeight: 500 }}>{row.item}</td>
                  <td className={styles.tdMono}>{row.qty} {row.unit}</td>
                  <td className={styles.tdMuted}>{row.reason}</td>
                  <td className={styles.tdMono}>${row.cost.toFixed(2)}</td>
                  <td className={styles.tdMuted}>
                    {new Date(row.createdAt).toLocaleString("es-MX", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
