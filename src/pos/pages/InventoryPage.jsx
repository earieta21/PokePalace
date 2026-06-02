import { useState, useEffect, useContext } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";

const ITEM_CATEGORIES = ["Proteínas", "Granos", "Verduras", "Salsas", "Extras", "Otro"];
const FILTER_CATEGORIES = ["Todos", ...ITEM_CATEGORIES];
const UNITS = ["kg", "pz", "L", "paq", "botellas", "manojos", "bolsas", "latas"];

const EMPTY_FORM = {
  item: "", category: "Proteínas", unit: "kg",
  qty: "", minQty: "", cost: "", supplier: "",
};

function statusOf(item) {
  if (item.qty <= 0)          return "critical";
  if (item.qty < item.minQty) return "low";
  return "ok";
}

const STATUS_CFG = {
  ok:       { cls: "badgeGreen",  label: "OK" },
  low:      { cls: "badgeYellow", label: "Bajo" },
  critical: { cls: "badgeRed",    label: "Crítico" },
};

export default function InventoryPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [filter, setFilter]   = useState("All");
  const [search, setSearch]   = useState("");

  // Add-item form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState("");

  // Inline qty edit
  const [editing, setEditing] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    api.get("/api/staff/inventory")
      .then((d) => setItems(d.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken]);

  const visible = items.filter((row) => {
    const matchCat    = filter === "Todos" || row.category === filter;
    const matchSearch = row.item.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  /* ── Add new item ── */
  const f = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.item || !form.qty) return;
    setSaving(true); setFormError("");
    try {
      const { item: created } = await api.post("/api/staff/inventory", {
        item:     form.item,
        category: form.category,
        unit:     form.unit,
        qty:      parseFloat(form.qty),
        minQty:   form.minQty ? parseFloat(form.minQty) : 0,
        cost:     form.cost   ? parseFloat(form.cost)   : 0,
        supplier: form.supplier,
      });
      setItems((prev) => [...prev, created]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  /* ── Inline qty edit ── */
  const saveQty = async (item) => {
    if (editQty === "" || isNaN(editQty)) { setEditing(null); return; }
    setEditSaving(true);
    try {
      const { item: updated } = await api.patch(`/api/staff/inventory/${item._id}`, {
        qty: parseFloat(editQty),
      });
      setItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
    } catch (e) { setError(e.message); }
    finally { setEditSaving(false); setEditing(null); }
  };

  /* ── Delete ── */
  const handleDelete = async (item) => {
    if (!window.confirm(`¿Eliminar "${item.item}"?`)) return;
    try {
      await api.delete(`/api/staff/inventory/${item._id}`);
      setItems((prev) => prev.filter((i) => i._id !== item._id));
    } catch (e) { setError(e.message); }
  };

  const totalValue = items.reduce((s, i) => s + i.qty * i.cost, 0);
  const lowCount   = items.filter((i) => statusOf(i) !== "ok").length;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Inventario</h1>
          <p className={styles.pageSubtitle}>
            {loading ? "Cargando…" : `${items.length} artículos · $${totalValue.toFixed(2)} valor total`}
          </p>
        </div>
        <button
          className={styles.btnPrimary}
          onClick={() => { setShowForm((v) => !v); setFormError(""); }}
        >
          {showForm ? "Cancelar" : "+ Agregar Artículo"}
        </button>
      </div>

      {/* ── Add item form ── */}
      {showForm && (
        <div className={styles.card} style={{ marginBottom: 20 }}>
          <p className={styles.cardTitle}>Nuevo Artículo de Inventario</p>
          <form onSubmit={handleAdd}>
            {formError && (
              <p style={{ color: "red", fontSize: 12, marginBottom: 12 }} role="alert">
                {formError}
              </p>
            )}

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Nombre del artículo *</label>
                <input className={styles.input} placeholder="ej. Atún Ahi" value={form.item} onChange={f("item")} required />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Categoría</label>
                <select className={styles.select} value={form.category} onChange={f("category")}>
                  {ITEM_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Cantidad actual *</label>
                <input className={styles.input} type="number" min="0" step="0.01" placeholder="0" value={form.qty} onChange={f("qty")} required />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Unidad</label>
                <select className={styles.select} value={form.unit} onChange={f("unit")}>
                  {UNITS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Cant. mínima (alerta)</label>
                <input className={styles.input} type="number" min="0" step="0.01" placeholder="0" value={form.minQty} onChange={f("minQty")} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Costo por unidad ($)</label>
                <input className={styles.input} type="number" min="0" step="0.01" placeholder="0.00" value={form.cost} onChange={f("cost")} />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Proveedor</label>
              <input className={styles.input} placeholder="ej. Ocean Fresh" value={form.supplier} onChange={f("supplier")} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className={styles.btnPrimary} type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Agregar al Inventario"}
              </button>
              <button className={styles.btnGhost} type="button" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Stats ── */}
      {!loading && (
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Total Artículos</p>
            <p className={styles.statValue}>{items.length}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Requieren Atención</p>
            <p className={styles.statValue}>{lowCount}</p>
            <p className={styles.statSub}>Bajo o crítico</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Valor Total</p>
            <p className={styles.statValue}>${totalValue.toFixed(0)}</p>
          </div>
        </div>
      )}

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          className={styles.input}
          style={{ maxWidth: 220 }}
          placeholder="Buscar artículos…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTER_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                padding: "7px 14px",
                borderRadius: "var(--p-radius-sm)",
                border: "1px solid var(--p-border)",
                background: filter === cat ? "var(--p-g2)" : "var(--p-surface)",
                color: filter === cat ? "#fff" : "var(--p-ink)",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: "Syne, sans-serif", transition: "background 120ms",
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Artículo</th><th>Categoría</th><th>Cant.</th><th>Unidad</th>
              <th>Mín.</th><th>Costo/U.</th><th>Valor</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: 24, color: "var(--p-muted)" }}>
                  Cargando inventario…
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: 24, color: "var(--p-muted)" }}>
                  Sin artículos que coincidan
                </td>
              </tr>
            ) : (
              visible.map((row) => {
                const status = statusOf(row);
                const { cls, label } = STATUS_CFG[status];
                const isEditing = editing === row._id;

                return (
                  <tr key={row._id}>
                    <td style={{ fontWeight: 500 }}>{row.item}</td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgeGray}`}>{row.category}</span>
                    </td>
                    <td className={styles.tdMono}>
                      {isEditing ? (
                        <input
                          type="number" min="0" step="0.01"
                          value={editQty}
                          onChange={(e) => setEditQty(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")  saveQty(row);
                            if (e.key === "Escape") setEditing(null);
                          }}
                          autoFocus
                          style={{
                            width: 70, padding: "3px 6px",
                            fontFamily: "DM Mono, monospace", fontSize: 12,
                            border: "1px solid var(--p-g3)", borderRadius: 4, outline: "none",
                          }}
                        />
                      ) : (
                        row.qty
                      )}
                    </td>
                    <td className={styles.tdMuted}>{row.unit}</td>
                    <td className={styles.tdMono}>{row.minQty}</td>
                    <td className={styles.tdMono}>${row.cost.toFixed(2)}</td>
                    <td className={styles.tdMono}>${(row.qty * row.cost).toFixed(2)}</td>
                    <td>
                      <span className={`${styles.badge} ${styles[cls]}`}>{label}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        {isEditing ? (
                          <button
                            className={styles.btnPrimary}
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            onClick={() => saveQty(row)}
                            disabled={editSaving}
                          >
                            {editSaving ? "…" : "Guardar"}
                          </button>
                        ) : (
                          <button
                            className={styles.btnGhost}
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            onClick={() => { setEditing(row._id); setEditQty(row.qty); }}
                          >
                            Editar cant.
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(row)}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "var(--p-muted)", fontSize: 16, padding: "0 4px",
                            lineHeight: 1, transition: "color 120ms",
                          }}
                          title="Eliminar artículo"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
