import { useState, useEffect, useContext } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";

const ROLE_CFG = {
  admin:   { cls: "badgeRed",    label: "Admin" },
  owner:   { cls: "badgeRed",    label: "Dueño" },
  manager: { cls: "badgeBlue",   label: "Gerente" },
  kitchen: { cls: "badgeYellow", label: "Cocina" },
  cashier: { cls: "badgeGreen",  label: "Cajero" },
};

function initials(name = "") {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

export default function EmployeesPage({ styles, role }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [search, setSearch]       = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Add employee form (admin/owner only)
  const canAdd = ["admin", "owner"].includes(role);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ name: "", email: "", password: "", role: "cashier" });
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    api.get("/api/staff/employees")
      .then((d) => setEmployees(d.employees ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken]);

  const visible = employees.filter((e) => {
    const matchSearch = (e.name + e.email).toLowerCase().includes(search.toLowerCase());
    const matchRole   = roleFilter === "all" || e.role === roleFilter;
    return matchSearch && matchRole;
  });

  const handleAdd = async (evt) => {
    evt.preventDefault();
    setSaving(true); setFormError("");
    try {
      const { employee } = await api.post("/api/staff/employees", form);
      setEmployees((prev) => [...prev, employee]);
      setForm({ name: "", email: "", password: "", role: "cashier" });
      setShowForm(false);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (emp) => {
    try {
      const { employee: updated } = await api.patch(`/api/staff/employees/${emp._id}`, {
        active: !emp.active,
      });
      setEmployees((prev) => prev.map((e) => (e._id === updated._id ? updated : e)));
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Empleados</h1>
          <p className={styles.pageSubtitle}>
            {loading ? "Cargando…" : `${employees.filter((e) => e.active).length} empleados activos`}
          </p>
        </div>
        {canAdd && (
          <button className={styles.btnPrimary} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancelar" : "+ Agregar Empleado"}
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className={styles.card} style={{ marginBottom: 20 }}>
          <p className={styles.cardTitle}>Nuevo Empleado</p>
          <form onSubmit={handleAdd}>
            {formError && <p style={{ color: "red", fontSize: 12, marginBottom: 12 }}>{formError}</p>}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Nombre</label>
                <input className={styles.input} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Correo electrónico</label>
                <input className={styles.input} type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Contraseña</label>
                <input className={styles.input} type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={6} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Rol</label>
                <select className={styles.select} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                  {Object.keys(ROLE_CFG).map((r) => <option key={r} value={r}>{ROLE_CFG[r].label}</option>)}
                </select>
              </div>
            </div>
            <button className={styles.btnPrimary} type="submit" disabled={saving}>
              {saving ? "Creando…" : "Crear Empleado"}
            </button>
          </form>
        </div>
      )}

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          className={styles.input} style={{ maxWidth: 240 }}
          placeholder="Buscar por nombre o correo…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <select className={styles.select} style={{ width: 160 }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">Todos los roles</option>
          {Object.entries(ROLE_CFG).map(([r, { label }]) => <option key={r} value={r}>{label}</option>)}
        </select>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Nombre</th><th>Rol</th><th>Correo</th><th>Estado</th>{canAdd && <th>Acciones</th>}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--p-muted)" }}>Cargando…</td></tr>
            ) : visible.map((emp) => {
              const { cls, label } = ROLE_CFG[emp.role] ?? ROLE_CFG.cashier;
              return (
                <tr key={emp._id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--p-g2)", color: "var(--p-g4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {initials(emp.name)}
                      </div>
                      <span style={{ fontWeight: 500 }}>{emp.name}</span>
                    </div>
                  </td>
                  <td><span className={`${styles.badge} ${styles[cls]}`}>{label}</span></td>
                  <td className={styles.tdMuted}>{emp.email}</td>
                  <td>
                    <span className={`${styles.badge} ${emp.active ? styles.badgeGreen : styles.badgeGray}`}>
                      {emp.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  {canAdd && (
                    <td>
                      <button className={styles.btnGhost} style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => toggleActive(emp)}>
                        {emp.active ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
