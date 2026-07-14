import { useState, useEffect, useContext } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import { downloadCSV } from "../../utils/csv";
import ui from "./InventoryPage.module.css";
import {
  BASE_LABELS, PROTEIN_LABELS, MARINADE_LABELS,
  COMPLEMENT_LABELS, SAUCE_LABELS, TOPPING_LABELS,
} from "../../order/OrderLabels";

const INVENTORY_SECTIONS = [
  { name: "Comida", icon: "🍣", categories: ["Proteínas", "Granos", "Verduras", "Salsas", "Extras", "Otro"] },
  { name: "Limpieza", icon: "🧼", categories: ["Químicos", "Higiene", "Utensilios", "Desechables", "Otro"] },
  { name: "Empaque", icon: "🥡", categories: ["Contenedores", "Cubiertos", "Bolsas", "Servilletas", "Otro"] },
  { name: "Otros", icon: "📦", categories: ["Equipo", "Oficina", "Otro"] },
];
const SECTION_NAMES = INVENTORY_SECTIONS.map((section) => section.name);
const UNITS = ["kg", "pz", "L", "paq", "botellas", "manojos", "bolsas", "latas", "cajas", "rollos", "gal"];
const LEGACY_CATEGORY_LABELS = {
  Grains: "Granos",
  Proteins: "Proteínas",
  Veggies: "Verduras",
  Sauces: "Salsas",
  Extras: "Extras",
  Other: "Otro",
};

const CLEANING_PRODUCTS = [
  { name: "Detergente lavatrastes", category: "Químicos", unit: "L" },
  { name: "Desengrasante", category: "Químicos", unit: "L" },
  { name: "Sanitizante", category: "Químicos", unit: "L" },
  { name: "Cloro", category: "Químicos", unit: "L" },
  { name: "Limpiavidrios", category: "Químicos", unit: "botellas" },
  { name: "Jabón para manos", category: "Higiene", unit: "L" },
  { name: "Guantes desechables", category: "Desechables", unit: "cajas" },
  { name: "Bolsas para basura", category: "Desechables", unit: "bolsas" },
  { name: "Toallas de papel", category: "Desechables", unit: "rollos" },
  { name: "Esponjas o fibras", category: "Utensilios", unit: "pz" },
];

const EMPTY_FORM = {
  item: "", section: "Comida", category: "Proteínas", unit: "kg",
  qty: "", minQty: "", cost: "", supplier: "", menuKeys: [],
  registerExpense: true,
};

// Ingredientes reales del builder — se usan para autocompletar nombre/categoría/unidad
// y vincular el artículo al menú sin que el empleado tenga que escribir claves técnicas.
const MENU_GROUPS = [
  { labels: BASE_LABELS,       group: "Base",       category: "Granos",    unit: "kg" },
  { labels: PROTEIN_LABELS,    group: "Proteína",    category: "Proteínas", unit: "kg" },
  { labels: MARINADE_LABELS,   group: "Marinado",   category: "Salsas",    unit: "L"  },
  { labels: COMPLEMENT_LABELS, group: "Complemento", category: "Verduras",  unit: "kg" },
  { labels: SAUCE_LABELS,      group: "Salsa",       category: "Salsas",    unit: "botellas" },
  { labels: TOPPING_LABELS,    group: "Topping",     category: "Extras",    unit: "paq" },
];

const MENU_ITEMS = MENU_GROUPS.flatMap(({ labels, group, category, unit }) =>
  Object.entries(labels).map(([key, label]) => ({ key, label, group, category, unit }))
);

function statusOf(item) {
  if (item.qty <= 0)           return "critical";
  if (item.qty <= item.minQty) return "low";
  return "ok";
}

// Los registros creados antes de agregar secciones pertenecen a Comida.
const sectionOf = (item) => item.section || "Comida";
const categoryOf = (item) => LEGACY_CATEGORY_LABELS[item.category] || item.category || "Otro";
const categoriesFor = (sectionName) =>
  INVENTORY_SECTIONS.find((section) => section.name === sectionName)?.categories || ["Otro"];

const STATUS_CFG = {
  ok:       { cls: "badgeGreen",  label: "Disponible" },
  low:      { cls: "badgeYellow", label: "Bajo" },
  critical: { cls: "badgeRed",    label: "Agotado" },
};

const parseKeys = (str) =>
  str.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);

export default function InventoryPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [notice, setNotice]   = useState("");
  const [filter, setFilter]   = useState("Todos");
  const [sectionFilter, setSectionFilter] = useState("Todos");
  const [stockFilter, setStockFilter] = useState("Todos");
  const [search, setSearch]   = useState("");
  const [showGuide, setShowGuide] = useState(true);

  // Add-item form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState("");

  // Inline edit: qty + menuKeys together
  const [editing, setEditing]   = useState(null); // item._id
  const [editForm, setEditForm] = useState({
    qty: "", section: "Comida", category: "Proteínas", unit: "kg",
    minQty: "", cost: "", supplier: "", menuKeys: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  // Advanced (optional) fields collapsed by default to keep the fast-add flow short
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Menu-item picker — search box that suggests real menu ingredients
  const [menuSearch, setMenuSearch] = useState("");

  // Receive shipment (restock) mode — adds to existing qty instead of overwriting
  const [receiving, setReceiving]         = useState(false);
  const [receiveSearch, setReceiveSearch] = useState("");
  const [receiveQty, setReceiveQty]       = useState({}); // { itemId: "3.5" }
  const [receiveSaving, setReceiveSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/api/staff/inventory")
      .then((d) => setItems(d.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [staffToken]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const visible = items.filter((row) => {
    const matchSection = sectionFilter === "Todos" || sectionOf(row) === sectionFilter;
    const matchCat    = filter === "Todos" || categoryOf(row) === filter;
    const matchStock  = stockFilter === "Todos" || statusOf(row) !== "ok";
    const matchSearch = row.item.toLowerCase().includes(search.toLowerCase());
    return matchSection && matchCat && matchStock && matchSearch;
  });

  const activeCategories = sectionFilter === "Todos"
    ? [...new Set(items.map(categoryOf).filter(Boolean))]
    : [...new Set([
        ...categoriesFor(sectionFilter),
        ...items.filter((item) => sectionOf(item) === sectionFilter).map(categoryOf).filter(Boolean),
      ])];
  const filterCategories = ["Todos", ...activeCategories];
  const editCategoryOptions = [...new Set([editForm.category, ...categoriesFor(editForm.section)].filter(Boolean))];
  const hasActiveFilters = sectionFilter !== "Todos" || filter !== "Todos" || stockFilter !== "Todos" || search.trim();

  const clearFilters = () => {
    setSectionFilter("Todos");
    setFilter("Todos");
    setStockFilter("Todos");
    setSearch("");
  };

  const chooseFormSection = (section) => {
    setForm((previous) => ({
      ...previous,
      section,
      category: categoriesFor(section)[0],
      menuKeys: section === "Comida" ? previous.menuKeys : [],
    }));
    if (section !== "Comida") setMenuSearch("");
  };

  const pickCleaningProduct = (product) => {
    setForm((previous) => ({
      ...previous,
      item: product.name,
      section: "Limpieza",
      category: product.category,
      unit: product.unit,
      menuKeys: [],
    }));
  };

  const closeAddForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setMenuSearch("");
    setShowAdvanced(false);
    setFormError("");
  };

  const closeReceiving = () => {
    setReceiving(false);
    setReceiveQty({});
    setReceiveSearch("");
  };

  /* ── Add new item ── */
  const f = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  // Picking a suggestion links the menu key and — the first time — auto-fills
  // nombre/categoría/unidad so the employee usually just has to type the quantity.
  const menuMatches = menuSearch.trim().length > 0
    ? MENU_ITEMS.filter((m) =>
        m.label.toLowerCase().includes(menuSearch.trim().toLowerCase()) &&
        !form.menuKeys.includes(m.key)
      ).slice(0, 6)
    : [];

  const pickMenuItem = (m) => {
    setForm((p) => {
      const isFirstPick = p.menuKeys.length === 0 && !p.item;
      return {
        ...p,
        menuKeys: [...p.menuKeys, m.key],
        item:     isFirstPick ? m.label    : p.item,
        section:  isFirstPick ? "Comida"  : p.section,
        category: isFirstPick ? m.category : p.category,
        unit:     isFirstPick ? m.unit     : p.unit,
      };
    });
    setMenuSearch("");
  };

  const removeMenuKey = (key) =>
    setForm((p) => ({ ...p, menuKeys: p.menuKeys.filter((k) => k !== key) }));

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.item || !form.qty) return;
    setSaving(true); setFormError("");
    try {
      const { item: created, expense } = await api.post("/api/staff/inventory", {
        item:     form.item,
        section:  form.section,
        category: form.category,
        unit:     form.unit,
        qty:      parseFloat(form.qty),
        minQty:   form.minQty ? parseFloat(form.minQty) : 0,
        cost:     form.cost   ? parseFloat(form.cost)   : 0,
        supplier: form.supplier,
        menuKeys: form.menuKeys,
        registerExpense: form.registerExpense,
      });
      setItems((prev) => [...prev, created]);
      setSectionFilter(form.section);
      setFilter("Todos");
      setStockFilter("Todos");
      setSearch("");
      setNotice(
        expense
          ? `${created.item} se agregó al inventario y se registró el gasto de $${expense.amount.toLocaleString("es-MX")} en Finanzas.`
          : `${created.item} se agregó al inventario.`
      );
      setForm(EMPTY_FORM);
      setMenuSearch("");
      setShowAdvanced(false);
      setShowForm(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  /* ── Inline edit ── */
  const startEdit = (row) => {
    setEditing(row._id);
    setEditForm({
      qty:      String(row.qty),
      section:  sectionOf(row),
      category: categoryOf(row),
      unit:     row.unit,
      minQty:   String(row.minQty ?? 0),
      cost:     String(row.cost ?? 0),
      supplier: row.supplier || "",
      menuKeys: (row.menuKeys || []).join(", "),
    });
  };

  const saveEdit = async (row) => {
    setEditSaving(true);
    try {
      const { item: updated } = await api.patch(`/api/staff/inventory/${row._id}`, {
        qty:      parseFloat(editForm.qty) || 0,
        section:  editForm.section,
        category: editForm.category,
        unit:     editForm.unit,
        minQty:   parseFloat(editForm.minQty) || 0,
        cost:     parseFloat(editForm.cost) || 0,
        supplier: editForm.supplier.trim(),
        menuKeys: parseKeys(editForm.menuKeys),
      });
      setItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
      setEditing(null);
      setNotice(`Se guardaron los cambios de ${updated.item}.`);
    } catch (err) { setError(err.message); }
    finally { setEditSaving(false); }
  };

  /* ── Delete ── */
  const handleDelete = async (row) => {
    if (!window.confirm(`¿Eliminar "${row.item}"?`)) return;
    try {
      await api.delete(`/api/staff/inventory/${row._id}`);
      setItems((prev) => prev.filter((i) => i._id !== row._id));
      setNotice(`${row.item} se eliminó del inventario.`);
    } catch (err) { setError(err.message); }
  };

  /* ── Receive shipment ── */
  const pendingReceiveCount = Object.values(receiveQty).filter((v) => parseFloat(v) > 0).length;
  const receiveGroups = Object.values(
    items
      .filter((item) => item.item.toLowerCase().includes(receiveSearch.toLowerCase()))
      .reduce((groups, item) => {
        const key = `${sectionOf(item)}::${categoryOf(item)}`;
        if (!groups[key]) groups[key] = { section: sectionOf(item), category: categoryOf(item), items: [] };
        groups[key].items.push(item);
        return groups;
      }, {})
  );

  const bumpReceive = (id, delta) =>
    setReceiveQty((p) => ({
      ...p,
      [id]: String(Math.max(0, (parseFloat(p[id]) || 0) + delta)),
    }));

  const submitReceiving = async () => {
    const entries = Object.entries(receiveQty).filter(([, v]) => parseFloat(v) > 0);
    if (entries.length === 0) return;
    setReceiveSaving(true);
    setError("");
    try {
      const results = await Promise.all(
        entries.map(([id, v]) =>
          api.patch(`/api/staff/inventory/${id}/restock`, { amount: parseFloat(v) })
        )
      );
      setItems((prev) => {
        const map = new Map(prev.map((i) => [i._id, i]));
        results.forEach(({ item }) => map.set(item._id, item));
        return [...map.values()];
      });
      const spent = results.reduce((sum, r) => sum + (r.expense?.amount || 0), 0);
      setReceiveQty({});
      setReceiveSearch("");
      setReceiving(false);
      setNotice(
        `Recepción guardada: ${results.length} artículo${results.length !== 1 ? "s" : ""} actualizado${results.length !== 1 ? "s" : ""}.` +
        (spent > 0 ? ` Se registraron $${spent.toLocaleString("es-MX")} de gastos en Finanzas.` : "")
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setReceiveSaving(false);
    }
  };

  const totalValue = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.cost) || 0), 0);
  const lowCount   = items.filter((i) => statusOf(i) !== "ok").length;

  function exportCSV() {
    const rows = [["Artículo", "Sección", "Categoría", "Cantidad", "Unidad", "Mínimo", "Costo unitario", "Valor total", "Proveedor", "Estado"]];
    visible.forEach((i) => {
      const statusLabel = STATUS_CFG[statusOf(i)].label;
      rows.push([i.item, sectionOf(i), categoryOf(i), i.qty, i.unit, i.minQty ?? 0, i.cost ?? 0, ((Number(i.qty) || 0) * (Number(i.cost) || 0)).toFixed(2), i.supplier || "", statusLabel]);
    });
    downloadCSV(`inventario_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  return (
    <div className={ui.inventoryRoot}>
      <div className={`${styles.pageHeader} ${ui.pageHeader}`}>
        <div>
          <h1 className={styles.pageTitle}>Inventario</h1>
          <p className={styles.pageSubtitle}>Consulta existencias, recibe mercancía y detecta lo que hace falta.</p>
        </div>
        <div className={ui.headerActions}>
          <button className={styles.btnGhost} onClick={() => setShowGuide((visible) => !visible)}>
            ? Cómo funciona
          </button>
          <button className={styles.btnGhost} onClick={load} title="Volver a cargar los datos">↻ Actualizar</button>
          <button className={styles.btnGhost} onClick={exportCSV} disabled={loading || visible.length === 0} title="Descargar la vista actual">
            ↓ Exportar
          </button>
          <button
            className={receiving ? styles.btnGhost : `${styles.btnPrimary} ${ui.receiveButton}`}
            onClick={() => {
              if (receiving) closeReceiving();
              else setReceiving(true);
              if (showForm) closeAddForm();
            }}
          >
            {receiving ? "Cerrar recepción" : "▣ Recibir mercancía"}
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => {
              if (showForm) closeAddForm();
              else setShowForm(true);
              closeReceiving();
            }}
          >
            {showForm ? "Cerrar formulario" : "+ Nuevo artículo"}
          </button>
        </div>
      </div>

      {showGuide && (
        <section className={ui.guide} aria-label="Guía rápida del inventario">
          <div className={ui.guideIntro}>
            <span className={ui.guideEyebrow}>Guía rápida</span>
            <strong>Tu inventario en tres pasos</strong>
            <button type="button" onClick={() => setShowGuide(false)} aria-label="Ocultar guía">×</button>
          </div>
          <div className={ui.guideSteps}>
            <div className={ui.guideStep}><span>1</span><p><strong>Elige una sección</strong>Separa comida, limpieza y empaques.</p></div>
            <div className={ui.guideStep}><span>2</span><p><strong>Busca o filtra</strong>Encuentra rápido el artículo que necesitas.</p></div>
            <div className={ui.guideStep}><span>3</span><p><strong>Actualiza existencias</strong>Edita una cantidad o registra una entrega.</p></div>
          </div>
        </section>
      )}

      {notice && (
        <div className={ui.successNotice} role="status">
          <span>✓</span>{notice}
          <button type="button" onClick={() => setNotice("")} aria-label="Cerrar notificación">×</button>
        </div>
      )}

      {/* ── Receive shipment ── */}
      {receiving && (
        <div className={`${styles.card} ${ui.actionPanel}`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <div>
              <p className={styles.cardTitle}>Recibir mercancía</p>
              <p style={{ fontSize: 12, color: "var(--p-muted)", margin: "2px 0 0" }}>
                Captura lo que llegó — se suma a lo que ya tienes, no lo reemplaza.
              </p>
            </div>
            {pendingReceiveCount > 0 && (
              <span style={{ background: "#4A7A5A", color: "#fff", fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "4px 12px" }}>
                {pendingReceiveCount} artículo{pendingReceiveCount > 1 ? "s" : ""} con cambios
              </span>
            )}
          </div>

          <label className={ui.receiveSearch}>
            <span>1. Busca el artículo que llegó</span>
            <input className={styles.input} placeholder="Escribe el nombre…" value={receiveSearch} onChange={(e) => setReceiveSearch(e.target.value)} />
          </label>

          {items.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--p-muted)" }}>Agrega artículos al inventario primero.</p>
          ) : receiveGroups.length === 0 ? (
            <div className={ui.emptyState}>
              <span>⌕</span>
              <strong>No encontramos ese artículo</strong>
              <p>Prueba con otro nombre.</p>
              <button type="button" className={styles.btnGhost} onClick={() => setReceiveSearch("")}>Limpiar búsqueda</button>
            </div>
          ) : (
            <div className={ui.receiveList}>
              {receiveGroups.map((group) => {
                return (
                  <div key={`${group.section}-${group.category}`}>
                    <p className={ui.receiveGroupTitle}>
                      {group.section} · {group.category}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {group.items.map((row) => {
                        const val = receiveQty[row._id] ?? "";
                        const hasValue = parseFloat(val) > 0;
                        return (
                          <div key={row._id} className={`${ui.receiveRow} ${hasValue ? ui.receiveRowActive : ""}`}>
                            <div className={ui.receiveInfo}>
                              <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{row.item}</p>
                              <p style={{ margin: 0, fontSize: 11, color: "var(--p-muted)" }}>
                                Actual: {row.qty} {row.unit}
                              </p>
                            </div>
                            <button type="button" className={ui.receiveQuickButton} onClick={() => bumpReceive(row._id, 1)}>
                              +1
                            </button>
                            <button type="button" className={ui.receiveQuickButton} onClick={() => bumpReceive(row._id, 5)}>
                              +5
                            </button>
                            <input
                              type="number" min="0" step="0.01" placeholder="0"
                              value={val}
                              onChange={(e) => setReceiveQty((p) => ({ ...p, [row._id]: e.target.value }))}
                              className={ui.receiveInput}
                              aria-label={`Cantidad recibida de ${row.item}`}
                            />
                            <span style={{ fontSize: 11, color: "var(--p-muted)", width: 34 }}>{row.unit}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className={ui.receiveFooter}>
            <span>2. Revisa las cantidades y guarda la recepción. Si el artículo tiene costo por unidad, el gasto se anota solo en Finanzas.</span>
            <button className={styles.btnPrimary} disabled={pendingReceiveCount === 0 || receiveSaving} onClick={submitReceiving}>
              {receiveSaving ? "Guardando…" : `Guardar recepción${pendingReceiveCount > 0 ? ` (${pendingReceiveCount})` : ""}`}
            </button>
            <button className={styles.btnGhost} onClick={closeReceiving}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Add item form ── */}
      {showForm && (
        <div className={styles.card} style={{ marginBottom: 20 }}>
          <p className={styles.cardTitle}>Nuevo artículo</p>
          <form onSubmit={handleAdd}>
            {formError && (
              <p style={{ color: "red", fontSize: 12, marginBottom: 12 }}>{formError}</p>
            )}

            <div className={ui.formStep}>
              <div className={ui.stepHeading}>
                <span>1</span>
                <div><strong>Elige la sección</strong><small>¿En qué parte del inventario debe aparecer?</small></div>
              </div>
              <div className={ui.formSectionPicker}>
                {INVENTORY_SECTIONS.map((section) => (
                  <button
                    key={section.name}
                    type="button"
                    aria-pressed={form.section === section.name}
                    className={form.section === section.name ? ui.formSectionActive : ""}
                    onClick={() => chooseFormSection(section.name)}
                  >
                    <span>{section.icon}</span>{section.name}
                  </button>
                ))}
              </div>
            </div>

            {form.section === "Limpieza" && (
              <div className={ui.cleaningQuickPick}>
                <div>
                  <span>Productos comunes</span>
                  <strong>Selecciona uno para llenar los datos automáticamente</strong>
                </div>
                <div className={ui.cleaningProductGrid}>
                  {CLEANING_PRODUCTS.map((product) => (
                    <button
                      key={product.name}
                      type="button"
                      className={form.item === product.name ? ui.cleaningProductActive : ""}
                      onClick={() => pickCleaningProduct(product)}
                    >
                      <span>🧽</span>
                      <span><strong>{product.name}</strong><small>{product.category} · {product.unit}</small></span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={ui.formStep}>
              <div className={ui.stepHeading}>
                <span>2</span>
                <div><strong>Captura lo esencial</strong><small>Nombre, tipo de artículo y existencia actual.</small></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Nombre del artículo *</label>
                  <input className={styles.input} placeholder={form.section === "Limpieza" ? "ej. Detergente" : "ej. Salmón"} value={form.item} onChange={f("item")} required />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Categoría</label>
                  <div className={ui.categoryPicker}>
                    {categoriesFor(form.section).map((category) => (
                      <button
                        key={category}
                        type="button"
                        aria-pressed={form.category === category}
                        onClick={() => setForm((previous) => ({ ...previous, category }))}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Cantidad actual *</label>
                  <input className={styles.input} type="number" min="0" step="0.01" placeholder="0" value={form.qty} onChange={f("qty")} required />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Unidad de medida</label>
                  <select className={styles.select} value={form.unit} onChange={f("unit")}>
                    {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {form.section === "Comida" && (
              <div className={ui.formStep}>
                <div className={ui.stepHeading}>
                  <span>3</span>
                  <div><strong>Vincula con el menú</strong><small>Opcional: permite descontar ingredientes al vender.</small></div>
                </div>
                <div className={styles.formGroup} style={{ position: "relative", marginBottom: 0 }}>
                  <label className={styles.label}>Buscar ingrediente del menú</label>
                  <input
                    className={styles.input}
                    placeholder="ej. salmón, aguacate, arroz…"
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                  />
                  {menuMatches.length > 0 && (
                    <div className={ui.menuSuggestions}>
                      {menuMatches.map((m) => (
                        <button key={m.key} type="button" onClick={() => pickMenuItem(m)}>
                          <span>{m.label}</span><small>{m.group}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  {form.menuKeys.length > 0 && (
                    <div className={ui.menuLinks}>
                      {form.menuKeys.map((key) => {
                        const meta = MENU_ITEMS.find((m) => m.key === key);
                        return (
                          <span key={key}>{meta?.label || key}<button type="button" onClick={() => removeMenuKey(key)} aria-label={`Quitar ${meta?.label || key}`}>×</button></span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Optional details, collapsed by default */}
            <button
              type="button"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((v) => !v)}
              className={ui.advancedToggle}
            >
              {showAdvanced ? "− Ocultar alerta, costo y proveedor" : "+ Configurar alerta, costo y proveedor"}
            </button>

            {showAdvanced && (
              <>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Cantidad mínima (alerta)</label>
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
                {parseFloat(form.cost) > 0 && parseFloat(form.qty) > 0 && (
                  <label className={ui.expenseToggle}>
                    <input
                      type="checkbox"
                      checked={form.registerExpense}
                      onChange={(e) => setForm((previous) => ({ ...previous, registerExpense: e.target.checked }))}
                    />
                    <span>
                      Registrar la compra en <strong>Finanzas</strong> — ${(parseFloat(form.qty) * parseFloat(form.cost)).toLocaleString("es-MX", { maximumFractionDigits: 2 })}
                    </span>
                  </label>
                )}
              </>
            )}

            <div className={ui.formActions}>
              <button className={styles.btnPrimary} type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Agregar al inventario"}
              </button>
              <button className={styles.btnGhost} type="button" onClick={closeAddForm}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {!loading && (
        <div className={ui.summaryGrid}>
          <button type="button" className={!hasActiveFilters ? ui.summaryActive : ""} onClick={clearFilters}>
            <span className={ui.summaryIcon}>▦</span>
            <span><small>Total de artículos</small><strong>{items.length}</strong><em>Ver inventario completo</em></span>
          </button>
          <button
            type="button"
            className={`${ui.warningSummary} ${stockFilter === "Bajo" && sectionFilter === "Todos" && filter === "Todos" && !search.trim() ? ui.summaryActive : ""}`}
            onClick={() => { setSectionFilter("Todos"); setFilter("Todos"); setStockFilter("Bajo"); setSearch(""); }}
          >
            <span className={ui.summaryIcon}>!</span>
            <span><small>Necesitan atención</small><strong>{lowCount}</strong><em>{lowCount ? "Ver faltantes" : "Todo está abastecido"}</em></span>
          </button>
          <div className={ui.summaryValue}>
            <span className={ui.summaryIcon}>$</span>
            <span><small>Valor del inventario</small><strong>${totalValue.toFixed(0)}</strong><em>Según costos registrados</em></span>
          </div>
        </div>
      )}

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {!loading && (
        <section className={ui.sectionsBlock}>
          <div className={ui.sectionTitle}>
            <div><span>Paso 1</span><strong>¿Qué quieres consultar?</strong></div>
            <small>Selecciona una sección para ver sus categorías.</small>
          </div>
          <div className={ui.sectionGrid}>
            {[{ name: "Todos", icon: "▦" }, ...INVENTORY_SECTIONS].map((section) => {
              const sectionItems = section.name === "Todos"
                ? items
                : items.filter((item) => sectionOf(item) === section.name);
              const sectionLow = sectionItems.filter((item) => statusOf(item) !== "ok").length;
              const selected = sectionFilter === section.name;
              return (
                <button
                  key={section.name}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => { setSectionFilter(section.name); setFilter("Todos"); }}
                  className={selected ? ui.sectionCardActive : ""}
                >
                  <span className={ui.sectionIcon}>{section.icon}</span>
                  <span className={ui.sectionCardText}>
                    <strong>{section.name === "Todos" ? "Todo" : section.name}</strong>
                    <small>{sectionItems.length} artículo{sectionItems.length !== 1 ? "s" : ""}</small>
                  </span>
                  {sectionLow > 0 && <span className={ui.sectionAlert} title={`${sectionLow} con bajo stock`}>{sectionLow}</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className={ui.filterPanel}>
        <div className={ui.listHeading}>
          <div>
            <span>Paso 2</span>
            <h2>{sectionFilter === "Todos" ? "Todos los artículos" : sectionFilter}</h2>
            <p>{visible.length} resultado{visible.length !== 1 ? "s" : ""}{stockFilter === "Bajo" ? " que necesitan atención" : ""}</p>
          </div>
          <label className={ui.searchBox}>
            <span>⌕</span>
            <input placeholder="Buscar por nombre…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>

        <div className={ui.filterRow}>
          {sectionFilter !== "Todos" && (
            <div className={ui.categoryChips} aria-label="Filtrar por categoría">
              {filterCategories.map((cat) => (
                <button key={cat} type="button" aria-pressed={filter === cat} onClick={() => setFilter(cat)}>{cat}</button>
              ))}
            </div>
          )}
          <button type="button" className={`${ui.attentionFilter} ${stockFilter === "Bajo" ? ui.attentionFilterActive : ""}`} onClick={() => setStockFilter((current) => current === "Bajo" ? "Todos" : "Bajo")}>
            <span>!</span> Solo bajo stock
          </button>
          {hasActiveFilters && <button type="button" className={ui.clearFilters} onClick={clearFilters}>Limpiar filtros</button>}
        </div>
      </section>

      {/* ── Table ── */}
      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${ui.inventoryTable}`}>
          <thead>
            <tr>
              <th>Artículo</th>
              <th>Existencia</th>
              <th>Mínimo</th>
              <th>Costo</th>
              <th>Estado</th>
              <th>Proveedor</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className={ui.loadingCell}>Cargando inventario…</td></tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className={ui.emptyState}>
                    <span>{items.length === 0 ? "▣" : "⌕"}</span>
                    <strong>{items.length === 0 ? "Tu inventario está vacío" : "No encontramos artículos"}</strong>
                    <p>{items.length === 0 ? "Registra el primer artículo para comenzar." : "Prueba con otro nombre o quita los filtros activos."}</p>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={() => items.length === 0 ? setShowForm(true) : clearFilters()}
                    >
                      {items.length === 0 ? "+ Agregar primer artículo" : "Mostrar todo"}
                    </button>
                  </div>
                </td>
              </tr>
            ) : visible.map((row) => {
              const status    = statusOf(row);
              const { cls, label } = STATUS_CFG[status];
              const isEditing = editing === row._id;

              return (
                <tr key={row._id} className={status === "critical" ? ui.criticalRow : status === "low" ? ui.lowRow : ""}>
                  <td className={ui.itemCell}>
                    <strong>{row.item}</strong>
                    {isEditing ? (
                      <div className={ui.itemEditMeta}>
                        <select
                          value={editForm.section}
                          aria-label="Sección"
                          onChange={(e) => {
                            const section = e.target.value;
                            setEditForm((previous) => ({
                              ...previous,
                              section,
                              category: categoriesFor(section)[0],
                              menuKeys: section === "Comida" ? previous.menuKeys : "",
                            }));
                          }}
                        >
                          {SECTION_NAMES.map((section) => <option key={section} value={section}>{section}</option>)}
                        </select>
                        <select value={editForm.category} aria-label="Categoría" onChange={(e) => setEditForm((previous) => ({ ...previous, category: e.target.value }))}>
                          {editCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                      </div>
                    ) : (
                      <small>{sectionOf(row)} · {categoryOf(row)}{(row.menuKeys || []).length > 0 ? " · Vinculado al menú" : ""}</small>
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <div className={ui.quantityEdit}>
                        <input type="number" min="0" step="0.01" aria-label="Cantidad" value={editForm.qty} onChange={(e) => setEditForm((p) => ({ ...p, qty: e.target.value }))} onKeyDown={(e) => e.key === "Escape" && setEditing(null)} autoFocus />
                        <select value={editForm.unit} aria-label="Unidad" onChange={(e) => setEditForm((p) => ({ ...p, unit: e.target.value }))}>
                          {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                        </select>
                      </div>
                    ) : <span className={ui.quantity}><strong>{row.qty}</strong> {row.unit}</span>}
                  </td>
                  <td>
                    {isEditing ? (
                      <input className={ui.compactInput} type="number" min="0" step="0.01" aria-label="Cantidad mínima" value={editForm.minQty} onChange={(e) => setEditForm((p) => ({ ...p, minQty: e.target.value }))} />
                    ) : <span className={styles.tdMono}>{row.minQty ?? 0} {row.unit}</span>}
                  </td>
                  <td>
                    {isEditing ? (
                      <div className={ui.moneyEdit}><span>$</span><input type="number" min="0" step="0.01" aria-label="Costo por unidad" value={editForm.cost} onChange={(e) => setEditForm((p) => ({ ...p, cost: e.target.value }))} /></div>
                    ) : row.cost > 0 ? `$${Number(row.cost).toFixed(2)}` : <span className={ui.mutedValue}>—</span>}
                  </td>
                  <td><span className={`${styles.badge} ${styles[cls]}`}>{label}</span></td>
                  <td>
                    {isEditing ? (
                      <input className={ui.supplierInput} aria-label="Proveedor" placeholder="Sin proveedor" value={editForm.supplier} onChange={(e) => setEditForm((p) => ({ ...p, supplier: e.target.value }))} />
                    ) : row.supplier || <span className={ui.mutedValue}>Sin proveedor</span>}
                  </td>
                  <td>
                    <div className={ui.rowActions}>
                      {isEditing ? (
                        <>
                          <button className={styles.btnPrimary} onClick={() => saveEdit(row)} disabled={editSaving}>
                            {editSaving ? "…" : "Guardar"}
                          </button>
                          <button className={styles.btnGhost} onClick={() => setEditing(null)}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button className={styles.btnGhost} onClick={() => startEdit(row)}>Editar</button>
                          <button className={ui.deleteButton} onClick={() => handleDelete(row)} aria-label={`Eliminar ${row.item}`} title="Eliminar artículo">×</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
