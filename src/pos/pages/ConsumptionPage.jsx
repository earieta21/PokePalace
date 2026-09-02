import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";

const SENIOR_ROLES = new Set(["manager", "admin", "owner"]);
const ROLE_LABELS = {
  employee: "Empleado/a",
  cashier: "Cajero/a",
  kitchen: "Cocina",
  manager: "Gerente",
  admin: "Admin",
  owner: "Dueño/a",
};

function normalizeCategory(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es-MX");
}

const isProtein = (item) =>
  ["protein", "proteins", "proteina", "proteinas"].includes(normalizeCategory(item?.category));

const requestId = () => {
  if (globalThis.crypto?.randomUUID) return `staff-meal:${globalThis.crypto.randomUUID()}`;
  return `staff-meal:${Date.now()}:${Math.random().toString(36).slice(2)}`;
};

const money = (value) => Number(value || 0).toLocaleString("es-MX", {
  style: "currency",
  currency: "MXN",
});

export default function ConsumptionPage({ styles, staffUser, employees = [] }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = useMemo(() => createStaffApi(staffToken), [staffToken]);
  const canManage = SENIOR_ROLES.has(staffUser?.role);

  const people = useMemo(() => {
    const rows = canManage ? employees : [];
    const byId = new Map(rows.map((row) => [String(row._id), row]));
    if (staffUser?.id && !byId.has(String(staffUser.id))) {
      byId.set(String(staffUser.id), {
        _id: staffUser.id,
        name: staffUser.name,
        role: staffUser.role,
      });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [canManage, employees, staffUser]);

  const [inventory, setInventory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [todayStatus, setTodayStatus] = useState(null);
  const [policy, setPolicy] = useState({ employeeDailyMeals: 1, employeeDailyProteinGrams: 50 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [clientRequestId, setClientRequestId] = useState(requestId);
  const [form, setForm] = useState({
    staffId: String(staffUser?.id || ""),
    meal: "Bowl del personal",
    proteinItemId: "",
    proteinGrams: "50",
    note: "",
  });

  const proteins = useMemo(
    () => inventory.filter(isProtein).sort((a, b) => a.item.localeCompare(b.item, "es")),
    [inventory]
  );
  const selectedPerson = people.find((row) => String(row._id) === String(form.staffId));
  const selectedRole = selectedPerson?.role || (
    String(form.staffId) === String(staffUser?.id) ? staffUser?.role : null
  );
  const selectedProtein = proteins.find((row) => String(row._id) === String(form.proteinItemId));

  const load = useCallback(async () => {
    setError("");
    try {
      const [consumptionData, inventoryData] = await Promise.all([
        api.get("/api/staff/consumption?limit=50"),
        api.get("/api/staff/inventory"),
      ]);
      setLogs(consumptionData.logs || []);
      setStats(consumptionData.stats || null);
      setTodayStatus(consumptionData.todayStatus || null);
      setPolicy(consumptionData.policy || { employeeDailyMeals: 1, employeeDailyProteinGrams: 50 });
      setInventory(inventoryData.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!form.proteinItemId && proteins.length > 0) {
      setForm((previous) => ({ ...previous, proteinItemId: String(proteins[0]._id) }));
    }
  }, [form.proteinItemId, proteins]);

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setForm((previous) => ({ ...previous, [field]: value }));
    setError("");
    setNotice("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { consumption } = await api.post("/api/staff/consumption", {
        ...form,
        proteinGrams: Number(form.proteinGrams),
        clientRequestId,
      });
      setNotice(`Consumo registrado para ${consumption.staffName}. Se descontaron ${consumption.proteinGrams} g de ${consumption.proteinName}.`);
      setForm((previous) => ({ ...previous, note: "" }));
      setClientRequestId(requestId());
      await load();
    } catch (err) {
      // Conserva clientRequestId para que "reintentar" sea idempotente.
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const voidRow = async (row) => {
    if (!globalThis.confirm(`¿Anular el consumo de ${row.staffName} y devolver la proteína al inventario?`)) return;
    setError("");
    setNotice("");
    try {
      await api.delete(`/api/staff/consumption/${row._id}`);
      setNotice("Registro anulado; la proteína volvió al inventario.");
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const ownAllowanceUsed = Boolean(todayStatus && staffUser?.role !== "owner");
  const formIsOwnLimitedMeal = String(form.staffId) === String(staffUser?.id) && staffUser?.role !== "owner";

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Consumo interno</h1>
          <p className={styles.pageSubtitle}>Comidas del equipo y dueños, separadas de ventas y mermas.</p>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Comidas de hoy</p>
          <p className={styles.statValue}>{loading ? "—" : stats?.todayMeals ?? 0}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Proteína de hoy</p>
          <p className={styles.statValue}>{loading ? "—" : `${stats?.todayProteinGrams ?? 0} g`}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Costo de proteína</p>
          <p className={styles.statValue}>{loading ? "—" : money(stats?.todayProteinCost)}</p>
          <p className={styles.statSub}>No se contabiliza como venta</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Mi prestación de hoy</p>
          <p className={`${styles.statValue} ${todayStatus ? styles.statAccent : ""}`}>
            {loading ? "—" : staffUser?.role === "owner" ? `${todayStatus ? "Registrada" : "Pendiente"}` : todayStatus ? "Usada" : "Disponible"}
          </p>
          <p className={styles.statSub}>1 bowl · hasta {policy.employeeDailyProteinGrams} g para empleados</p>
        </div>
      </div>

      <div className={styles.grid2} style={{ alignItems: "start", marginBottom: 24 }}>
        <div className={styles.card}>
          <p className={styles.cardTitle}>Registrar comida</p>

          <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(45, 106, 79, .07)", color: "var(--p-muted)", fontSize: 12, lineHeight: 1.5, marginBottom: 16 }}>
            El registro descuenta la proteína elegida del inventario. El costo mostrado corresponde solo a esa proteína; las bases y complementos no se estiman aquí.
          </div>

          {notice && <p role="status" style={{ color: "var(--p-g2)", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>✓ {notice}</p>}
          {error && <p role="alert" style={{ color: "#a32929", fontSize: 12, marginBottom: 12 }}>{error}</p>}

          {proteins.length === 0 && !loading ? (
            <p style={{ color: "var(--p-muted)", fontSize: 13 }}>
              Primero agrega una proteína en Inventario con categoría “Proteínas” y unidad kg o g.
            </p>
          ) : (
            <form onSubmit={submit}>
              {canManage && (
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="consumption-person">¿Quién consumió?</label>
                  <select id="consumption-person" className={styles.select} value={form.staffId} onChange={updateField("staffId")} required>
                    {people.map((person) => (
                      <option key={person._id} value={person._id}>
                        {person.name}{person.role ? ` · ${ROLE_LABELS[person.role] || person.role}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="consumption-meal">Comida</label>
                <input id="consumption-meal" className={styles.input} maxLength={120} value={form.meal} onChange={updateField("meal")} required />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="consumption-protein">Proteína</label>
                  <select id="consumption-protein" className={styles.select} value={form.proteinItemId} onChange={updateField("proteinItemId")} required>
                    {proteins.map((item) => (
                      <option key={item._id} value={item._id}>{item.item} · {item.qty} {item.unit}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="consumption-grams">Gramos</label>
                  <input
                    id="consumption-grams"
                    className={styles.input}
                    type="number"
                    min="1"
                    max={selectedRole === "owner" ? 1000 : policy.employeeDailyProteinGrams}
                    step="1"
                    value={form.proteinGrams}
                    onChange={updateField("proteinGrams")}
                    required
                  />
                </div>
              </div>

              {selectedProtein && (
                <p style={{ color: "var(--p-muted)", fontSize: 11.5, margin: "-7px 0 14px" }}>
                  Existencia: {selectedProtein.qty} {selectedProtein.unit} · costo estimado de esta proteína: {money((Number(form.proteinGrams) / (selectedProtein.unit === "kg" ? 1000 : 1)) * Number(selectedProtein.cost || 0))}
                </p>
              )}

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="consumption-note">Nota (opcional)</label>
                <textarea id="consumption-note" className={styles.textarea} rows={2} maxLength={300} placeholder="Ej. comida después del turno" value={form.note} onChange={updateField("note")} />
              </div>

              {selectedRole !== "owner" && (
                <p style={{ color: "var(--p-muted)", fontSize: 11.5, marginBottom: 12 }}>
                  La app permitirá una sola comida por día y hasta {policy.employeeDailyProteinGrams} g para esta persona.
                </p>
              )}

              <button
                className={styles.btnPrimary}
                type="submit"
                style={{ width: "100%" }}
                disabled={saving || proteins.length === 0 || (formIsOwnLimitedMeal && ownAllowanceUsed)}
              >
                {saving ? "Registrando…" : formIsOwnLimitedMeal && ownAllowanceUsed ? "Mi comida de hoy ya está registrada" : "Registrar y descontar inventario"}
              </button>
            </form>
          )}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Persona</th><th>Consumo</th><th>Proteína</th><th>Costo</th><th>Cuándo</th>{canManage && <th />}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canManage ? 6 : 5} style={{ textAlign: "center", padding: 24, color: "var(--p-muted)" }}>Cargando…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={canManage ? 6 : 5} style={{ textAlign: "center", padding: 24, color: "var(--p-muted)" }}>Sin consumos registrados</td></tr>
              ) : logs.map((row) => (
                <tr key={row._id}>
                  <td><strong>{row.staffName}</strong><br /><small className={styles.tdMuted}>{ROLE_LABELS[row.staffRole] || row.staffRole}</small></td>
                  <td>{row.meal}{row.note && <><br /><small className={styles.tdMuted}>{row.note}</small></>}</td>
                  <td className={styles.tdMono}>{row.proteinGrams} g<br /><small className={styles.tdMuted}>{row.proteinName}</small></td>
                  <td className={styles.tdMono}>{money(row.proteinCost)}</td>
                  <td className={styles.tdMuted}>{new Date(row.createdAt).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  {canManage && <td><button type="button" className={styles.btnGhost} onClick={() => voidRow(row)}>Anular</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
