import { useState, useEffect, useContext } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";

const ITEM_CATEGORIES = ["Proteínas", "Granos", "Verduras", "Salsas", "Extras", "Otro"];
const FILTER_CATEGORIES = ["Todos", ...ITEM_CATEGORIES];
const UNITS = ["kg", "pz", "L", "paq", "botellas", "manojos", "bolsas", "latas"];

const EMPTY_FORM = {
  item: "", category: "Proteínas", unit: "kg",
  qty: "", minQty: "", cost: "", supplier: "", menuKeys: "",
};

// Hint shown below the menuKeys input so staff know what keys to use
const MENU_KEYS_HINT = [
  "Proteínas: salmon · tuna · shrimp · chicken · tofu · crab · yellowtail · octopus",
  "Bases: white_rice · brown_rice · salad · quinoa",
  "Marinadas: citrus_marinade · soy_ginger · spicy_mayo · sesame_oil",
  "Complementos: avocado · corn · cucumber · edamame · mango · jalapeño",
  "Salsas: ponzu · teriyaki · sriracha · sweet_chili · peanut",
  "Toppings: sesame · seaweed · crispy_onion · masago",
].join("  |  ");

function statusOf(item) {
  if (item.qty <= 0)           return "critical";
  if (item.qty < item.minQty)  return "low";
  return "ok";
}

const STATUS_CFG = {
  ok:       { cls: "badgeGreen",  label: "OK" },
  low:      { cls: "badgeYellow", label: "Bajo" },
  critical: { cls: "badgeRed",    label: "Crítico" },
};

const parseKeys = (str) =>
  str.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);

export default function InventoryPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [filter, setFilter]   = useState("Todos");
  const [search, setSearch]   = useState("");

  // Add-item form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState("");

  // Inline edit: qty + menuKeys together
  const [editing, setEditing]   = useState(null); // item._id
  const [editForm, setEditForm] = useState({ qty: "", menuKeys: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Hint expand
  const [showHint, setShowHint] = useState(false);

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
        menuKeys: parseKeys(form.menuKeys),
      });
      setItems((prev) => [...prev, created]);
      setForm(EMPTY_FORM);
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
      menuKeys: (row.menuKeys || []).join(", "),
    });
  };

  const saveEdit = async (row) => {
    setEditSaving(true);
    try {
      const { item: updated } = await api.patch(`/api/staff/inventory/${row._id}`, {
        qty:      parseFloat(editForm.qty) || 0,
        menuKeys: parseKeys(editForm.menuKeys),
      });
      setItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
      setEditing(null);
    } catch (err) { setError(err.message); }
    finally { setEditSaving(false); }
  };

  /* ── Delete ── */
  const handleDelete = async (row) => {
    if (!window.confirm(`¿Eliminar "${row.item}"?`)) return;
    try {
      await api.delete(`/api/staff/inventory/${row._id}`);
      setItems((prev) => prev.filter((i) => i._id !== row._id));
    } catch (err) { setError(err.message); }
  };

  /* ── Receive shipment ── */
  const pendingReceiveCount = Object.values(receiveQty).filter((v) => parseFloat(v) > 0).length;

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
      setReceiveQty({});
      setReceiving(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setReceiveSaving(false);
    }
  };

  const totalValue = items.reduce((s, i) => s + i.qty * i.cost, 0);
  const lowCount   = items.filter((i) => statusOf(i) !== "ok").length;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Inventario</h1>
          <p className={styles.pageSubtitle}>
            {loading ? "Cargando…" : `${items.length} artículos · $${totalValue.toFixed(0)} valor total`}
            {lowCount > 0 && !loading && (
              <span style={{
                marginLeft: 10, background: "#e74c3c", color: "#fff",
                fontSize: 11, fontWeight: 700, borderRadius: 10,
                padding: "1px 7px",
              }}>
                {lowCount} bajo stock
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={styles.btnGhost} onClick={load}>Actualizar</button>
          <button
            className={receiving ? styles.btnGhost : styles.btnPrimary}
            style={{ background: receiving ? undefined : "#4A7A5A" }}
            onClick={() => {
              setReceiving((v) => !v);
              setShowForm(false);
              if (receiving) setReceiveQty({});
            }}
          >
            {receiving ? "Cancelar" : "📦 Recibir mercancía"}
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => { setShowForm((v) => !v); setFormError(""); setReceiving(false); }}
          >
            {showForm ? "Cancelar" : "+ Agregar artículo"}
          </button>
        </div>
      </div>

      {/* ── Receive shipment ── */}
      {receiving && (
        <div className={styles.card} style={{ marginBottom: 20 }}>
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

          <input
            className={styles.input}
            placeholder="Buscar artículo…"
            value={receiveSearch}
            onChange={(e) => setReceiveSearch(e.target.value)}
            style={{ marginBottom: 16, maxWidth: 280 }}
          />

          {items.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--p-muted)" }}>Agrega artículos al inventario primero.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxHeight: 480, overflowY: "auto" }}>
              {ITEM_CATEGORIES.map((cat) => {
                const catItems = items.filter(
                  (i) => i.category === cat && i.item.toLowerCase().includes(receiveSearch.toLowerCase())
                );
                if (catItems.length === 0) return null;
                return (
                  <div key={cat}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "var(--p-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                      {cat}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {catItems.map((row) => {
                        const val = receiveQty[row._id] ?? "";
                        const hasValue = parseFloat(val) > 0;
                        return (
                          <div key={row._id} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "8px 10px", borderRadius: 8,
                            background: hasValue ? "rgba(74,122,90,0.08)" : "var(--p-bg)",
                            border: hasValue ? "1px solid rgba(74,122,90,0.3)" : "1px solid transparent",
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{row.item}</p>
                              <p style={{ margin: 0, fontSize: 11, color: "var(--p-muted)" }}>
                                Actual: {row.qty} {row.unit}
                              </p>
                            </div>
                            <button type="button" onClick={() => bumpReceive(row._id, 1)}
                              style={{ padding: "5px 9px", fontSize: 12, fontWeight: 700, border: "1px solid var(--p-border)", borderRadius: 6, background: "var(--p-surface)", cursor: "pointer", color: "var(--p-ink)" }}>
                              +1
                            </button>
                            <button type="button" onClick={() => bumpReceive(row._id, 5)}
                              style={{ padding: "5px 9px", fontSize: 12, fontWeight: 700, border: "1px solid var(--p-border)", borderRadius: 6, background: "var(--p-surface)", cursor: "pointer", color: "var(--p-ink)" }}>
                              +5
                            </button>
                            <input
                              type="number" min="0" step="0.01" placeholder="0"
                              value={val}
                              onChange={(e) => setReceiveQty((p) => ({ ...p, [row._id]: e.target.value }))}
                              style={{ width: 62, padding: "6px 6px", fontFamily: "DM Mono,monospace", fontSize: 13, border: "1px solid var(--p-g3)", borderRadius: 6, outline: "none", textAlign: "center" }}
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

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button className={styles.btnPrimary} disabled={pendingReceiveCount === 0 || receiveSaving} onClick={submitReceiving}>
              {receiveSaving ? "Guardando…" : `Guardar recepción${pendingReceiveCount > 0 ? ` (${pendingReceiveCount})` : ""}`}
            </button>
            <button className={styles.btnGhost} onClick={() => { setReceiving(false); setReceiveQty({}); }}>
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

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Nombre *</label>
                <input className={styles.input} placeholder="ej. Salmón" value={form.item} onChange={f("item")} required />
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
                <label className={styles.label}>Cantidad *</label>
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

            {/* menuKeys field */}
            <div className={styles.formGroup}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <label className={styles.label} style={{ margin: 0 }}>Claves de menú (separadas por coma)</label>
                <button type="button" onClick={() => setShowHint((v) => !v)}
                  style={{ fontSize: 11, color: "var(--p-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  {showHint ? "Ocultar" : "Ver claves disponibles"}
                </button>
              </div>
              {showHint && (
                <p style={{ fontSize: 10.5, color: "var(--p-muted)", lineHeight: 1.6, marginBottom: 6, background: "var(--p-bg)", padding: "8px 10px", borderRadius: 6 }}>
                  {MENU_KEYS_HINT}
                </p>
              )}
              <input className={styles.input}
                placeholder="ej. salmon, salmon_spicy, salmon_citrus"
                value={form.menuKeys}
                onChange={f("menuKeys")}
              />
              <p style={{ fontSize: 11, color: "var(--p-muted)", margin: "4px 0 0" }}>
                El sistema descuenta 1 unidad de este artículo por cada bowl/orden que incluya alguna de estas claves.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className={styles.btnPrimary} type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Agregar"}
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
        <div className={styles.statsRow} style={{ marginBottom: 20 }}>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Total artículos</p>
            <p className={styles.statValue}>{items.length}</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Bajo stock</p>
            <p className={`${styles.statValue} ${lowCount > 0 ? styles.statAccent : ""}`}>{lowCount}</p>
            <p className={styles.statSub}>Bajo o crítico</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statLabel}>Valor total</p>
            <p className={styles.statValue}>${totalValue.toFixed(0)}</p>
          </div>
        </div>
      )}

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className={styles.input}
          style={{ maxWidth: 200 }}
          placeholder="Buscar…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTER_CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setFilter(cat)}
              style={{
                padding: "6px 13px", borderRadius: "var(--p-radius-sm)",
                border: "1px solid var(--p-border)",
                background: filter === cat ? "var(--p-g2)" : "var(--p-surface)",
                color: filter === cat ? "#fff" : "var(--p-ink)",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: "Syne, sans-serif", transition: "background 120ms",
              }}
            >{cat}</button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Artículo</th>
              <th>Cat.</th>
              <th>Cant.</th>
              <th>U.</th>
              <th>Mín.</th>
              <th>Estado</th>
              <th>Claves de menú</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--p-muted)" }}>Cargando inventario…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--p-muted)" }}>Sin artículos que coincidan</td></tr>
            ) : visible.map((row) => {
              const status    = statusOf(row);
              const { cls, label } = STATUS_CFG[status];
              const isEditing = editing === row._id;

              return (
                <tr key={row._id} style={{ background: status === "critical" ? "rgba(231,76,60,0.04)" : status === "low" ? "rgba(241,196,15,0.04)" : undefined }}>
                  <td style={{ fontWeight: 600 }}>{row.item}</td>
                  <td><span className={`${styles.badge} ${styles.badgeGray}`}>{row.category}</span></td>

                  {/* Qty — editable */}
                  <td className={styles.tdMono}>
                    {isEditing ? (
                      <input type="number" min="0" step="0.01"
                        value={editForm.qty}
                        onChange={(e) => setEditForm((p) => ({ ...p, qty: e.target.value }))}
                        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                        autoFocus
                        style={{ width: 60, padding: "3px 6px", fontFamily: "DM Mono,monospace", fontSize: 12, border: "1px solid var(--p-g3)", borderRadius: 4, outline: "none" }}
                      />
                    ) : row.qty}
                  </td>

                  <td className={styles.tdMuted}>{row.unit}</td>
                  <td className={styles.tdMono}>{row.minQty}</td>
                  <td><span className={`${styles.badge} ${styles[cls]}`}>{label}</span></td>

                  {/* menuKeys — editable */}
                  <td>
                    {isEditing ? (
                      <input
                        value={editForm.menuKeys}
                        onChange={(e) => setEditForm((p) => ({ ...p, menuKeys: e.target.value }))}
                        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                        placeholder="salmon, white_rice, avocado…"
                        style={{ width: "100%", minWidth: 160, padding: "3px 7px", fontSize: 11, border: "1px solid var(--p-g3)", borderRadius: 4, outline: "none", fontFamily: "DM Mono,monospace" }}
                      />
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {(row.menuKeys || []).length === 0 ? (
                          <span style={{ fontSize: 11, color: "var(--p-muted)", fontStyle: "italic" }}>Sin vincular</span>
                        ) : (row.menuKeys).map((k) => (
                          <span key={k} style={{
                            fontSize: 10, fontFamily: "DM Mono,monospace",
                            background: "var(--p-bg)", border: "1px solid var(--p-border)",
                            borderRadius: 4, padding: "1px 5px", color: "var(--p-ink)",
                          }}>{k}</span>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      {isEditing ? (
                        <>
                          <button className={styles.btnPrimary}
                            style={{ padding: "4px 10px", fontSize: 11 }}
                            onClick={() => saveEdit(row)} disabled={editSaving}>
                            {editSaving ? "…" : "Guardar"}
                          </button>
                          <button className={styles.btnGhost}
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={() => setEditing(null)}>
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <button className={styles.btnGhost}
                            style={{ padding: "4px 10px", fontSize: 11 }}
                            onClick={() => startEdit(row)}>
                            Editar
                          </button>
                          <button onClick={() => handleDelete(row)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--p-muted)", fontSize: 16, padding: "0 2px", lineHeight: 1, transition: "color 120ms" }}
                            onMouseEnter={(ev) => (ev.currentTarget.style.color = "#c0392b")}
                            onMouseLeave={(ev) => (ev.currentTarget.style.color = "var(--p-muted)")}
                            title="Eliminar">×</button>
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
