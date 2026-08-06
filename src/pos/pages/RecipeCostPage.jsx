import { useState, useEffect, useContext, useCallback, useMemo } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import ui from "./RecipeCostPage.module.css";

const fmtMXN = (n) => n == null ? "—" : `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n) => n == null ? "—" : `${n.toFixed(1)}%`;

const STATUS_CFG = {
  green:  { label: "Completo",     dot: "#2d6a4f" },
  yellow: { label: "Falta costo",  dot: "#b45309" },
  red:    { label: "Sin receta",   dot: "#b44336" },
};

export default function RecipeCostPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("todos"); // todos | red | yellow | green
  const [editingId, setEditingId] = useState(null); // catalogId en edición
  const [detail, setDetail] = useState(null); // respuesta de GET /:catalogId
  const [form, setForm] = useState({ ingredients: [], packaging: [], commissionPct: "0", notes: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/staff/recipes"),
      api.get("/api/staff/inventory"),
    ])
      .then(([r, inv]) => {
        setProducts(r.products ?? []);
        setInventory(inv.items ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(t);
  }, [notice]);

  const ingredientKeys = useMemo(() => {
    const keys = new Set();
    inventory.forEach((item) => (item.menuKeys || []).forEach((k) => keys.add(k)));
    return [...keys].sort();
  }, [inventory]);

  const visibleProducts = filter === "todos" ? products : products.filter((p) => p.status === filter);
  const counts = useMemo(() => ({
    green: products.filter((p) => p.status === "green").length,
    yellow: products.filter((p) => p.status === "yellow").length,
    red: products.filter((p) => p.status === "red").length,
  }), [products]);

  const openEditor = async (catalogId) => {
    setEditingId(catalogId);
    setFormError("");
    setDetail(null);
    try {
      const d = await api.get(`/api/staff/recipes/${catalogId}`);
      setDetail(d);
      setForm({
        ingredients: (d.recipe?.ingredients || []).map((i) => ({ ...i })),
        packaging: (d.recipe?.packaging || []).map((p) => ({ ...p })),
        commissionPct: String(d.recipe?.commissionPct ?? 0),
        notes: "",
      });
    } catch (e) { setFormError(e.message); }
  };

  const closeEditor = () => { setEditingId(null); setDetail(null); setFormError(""); };

  const addIngredientRow = () => setForm((f) => ({ ...f, ingredients: [...f.ingredients, { key: ingredientKeys[0] || "", portions: 1 }] }));
  const removeIngredientRow = (idx) => setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));
  const updateIngredientRow = (idx, field, value) => setForm((f) => ({
    ...f, ingredients: f.ingredients.map((row, i) => i === idx ? { ...row, [field]: value } : row),
  }));

  const addPackagingRow = () => setForm((f) => ({ ...f, packaging: [...f.packaging, { inventoryItemId: inventory[0]?._id || "", description: "", qty: 1 }] }));
  const removePackagingRow = (idx) => setForm((f) => ({ ...f, packaging: f.packaging.filter((_, i) => i !== idx) }));
  const updatePackagingRow = (idx, field, value) => setForm((f) => ({
    ...f, packaging: f.packaging.map((row, i) => i === idx ? { ...row, [field]: value } : row),
  }));

  const handleSave = async () => {
    setFormError(""); setSaving(true);
    try {
      const { recipe } = await api.post("/api/staff/recipes", {
        catalogId: editingId,
        name: detail?.product?.name,
        ingredients: form.ingredients.filter((i) => i.key),
        packaging: form.packaging.filter((p) => p.inventoryItemId || p.description),
        commissionPct: form.commissionPct,
        notes: form.notes,
      });
      setNotice(`Receta guardada — versión ${recipe.version}.`);
      closeEditor();
      load();
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className={ui.root}>
      <div className={`${styles.pageHeader} ${ui.pageHeader}`}>
        <div>
          <h1 className={styles.pageTitle}>Costo del menú</h1>
          <p className={styles.pageSubtitle}>Receta, costo completo y margen de cada producto — semáforo de qué falta.</p>
        </div>
        <div className={ui.headerActions}>
          <button className={styles.btnGhost} onClick={load}>↻ Actualizar</button>
        </div>
      </div>

      {notice && (
        <div className={ui.successNotice} role="status">
          <span>✓</span>{notice}
          <button type="button" onClick={() => setNotice("")} aria-label="Cerrar">×</button>
        </div>
      )}
      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div className={ui.filterRow}>
        {["todos", "green", "yellow", "red"].map((key) => (
          <button
            key={key}
            type="button"
            className={`${ui.filterChip} ${filter === key ? ui.filterChipActive : ""}`}
            onClick={() => setFilter(key)}
          >
            {key === "todos" ? `Todos (${products.length})` : (
              <><span className={ui.dot} style={{ background: STATUS_CFG[key].dot }} />{STATUS_CFG[key].label} ({counts[key]})</>
            )}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${ui.recipeTable}`}>
          <thead>
            <tr>
              <th></th>
              <th>Producto</th>
              <th>Precio</th>
              <th>Costo ingredientes</th>
              <th>Costo empaque</th>
              <th>Costo completo</th>
              <th>Ganancia</th>
              <th>Margen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className={ui.loadingCell}>Cargando…</td></tr>
            ) : visibleProducts.length === 0 ? (
              <tr><td colSpan={9} className={ui.loadingCell}>Sin productos en este filtro.</td></tr>
            ) : visibleProducts.map((p) => (
              <tr key={p.catalogId}>
                <td><span className={ui.dot} style={{ background: STATUS_CFG[p.status].dot }} title={STATUS_CFG[p.status].label} /></td>
                <td><strong>{p.name}</strong><br /><small className={ui.muted}>{p.catalogId}{p.version ? ` · v${p.version}` : ""}</small></td>
                <td className={styles.tdMono}>{fmtMXN(p.price)}</td>
                <td className={styles.tdMono}>{fmtMXN(p.ingredientsCost)}</td>
                <td className={styles.tdMono}>{fmtMXN(p.packagingCost)}</td>
                <td className={styles.tdMono}><strong>{fmtMXN(p.fullCost)}</strong></td>
                <td className={styles.tdMono}>{fmtMXN(p.profit)}</td>
                <td className={styles.tdMono}>{fmtPct(p.marginPct)}</td>
                <td><button className={styles.btnGhost} onClick={() => openEditor(p.catalogId)}>Editar receta</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingId && (
        <div className={ui.modalOverlay} onClick={closeEditor}>
          <div className={`${styles.card} ${ui.modal}`} onClick={(e) => e.stopPropagation()}>
            <p className={styles.cardTitle}>
              Receta — {detail?.product?.name || editingId}
              {detail?.recipe && <span className={ui.muted}> (editando, se guardará como v{(detail.recipe.version || 1) + 1})</span>}
            </p>

            {formError && <p style={{ color: "red", fontSize: 12, marginBottom: 10 }}>{formError}</p>}

            <p className={ui.sectionLabel}>Ingredientes</p>
            {form.ingredients.map((row, idx) => (
              <div key={idx} className={ui.ingredientRow}>
                <select className={styles.input} value={row.key} onChange={(e) => updateIngredientRow(idx, "key", e.target.value)}>
                  {ingredientKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <input className={styles.input} type="number" min="0" step="0.01" value={row.portions}
                  onChange={(e) => updateIngredientRow(idx, "portions", e.target.value)} placeholder="porciones" />
                <button type="button" className={ui.removeBtn} onClick={() => removeIngredientRow(idx)}>×</button>
              </div>
            ))}
            <button type="button" className={styles.btnGhost} onClick={addIngredientRow}>+ Agregar ingrediente</button>

            <p className={ui.sectionLabel} style={{ marginTop: 16 }}>Empaque</p>
            {form.packaging.map((row, idx) => (
              <div key={idx} className={ui.ingredientRow}>
                <select className={styles.input} value={row.inventoryItemId || ""} onChange={(e) => updatePackagingRow(idx, "inventoryItemId", e.target.value)}>
                  <option value="">— artículo de inventario —</option>
                  {inventory.map((i) => <option key={i._id} value={i._id}>{i.item}</option>)}
                </select>
                <input className={styles.input} type="number" min="0" step="0.01" value={row.qty}
                  onChange={(e) => updatePackagingRow(idx, "qty", e.target.value)} placeholder="cantidad" />
                <button type="button" className={ui.removeBtn} onClick={() => removePackagingRow(idx)}>×</button>
              </div>
            ))}
            <button type="button" className={styles.btnGhost} onClick={addPackagingRow}>+ Agregar empaque</button>

            <div className={styles.formRow} style={{ marginTop: 16 }}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Comisión estimada (%)</label>
                <input className={styles.input} type="number" min="0" max="100" step="0.1"
                  value={form.commissionPct} onChange={(e) => setForm((f) => ({ ...f, commissionPct: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Notas de este cambio</label>
                <input className={styles.input} placeholder="¿Por qué cambia la receta?"
                  value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            <p className={ui.hint}>
              Si un ingrediente no tiene gramos/porción o rendimiento capturados en Inventario, esta receta
              se va a quedar en amarillo aunque la guardes — captúralo en la pantalla de Inventario primero.
            </p>

            <div className={ui.formActions}>
              <button className={styles.btnPrimary} onClick={handleSave} disabled={saving} type="button">
                {saving ? "Guardando…" : "Guardar receta"}
              </button>
              <button className={styles.btnGhost} type="button" onClick={closeEditor}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}