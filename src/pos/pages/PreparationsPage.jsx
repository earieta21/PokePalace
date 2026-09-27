import { useState, useEffect, useContext, useCallback } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import {
  MARINADE_LABELS, SAUCE_LABELS, COMPLEMENT_LABELS, PROTEIN_LABELS,
} from "../../order/OrderLabels";
import { createStaffApi } from "../api";
import ui from "./PreparationsPage.module.css";

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const UNITS = ["kg", "gr", "lt", "ml", "pz"];
const TIPOLOGIAS = ["aderezo", "marinado", "mezcla", "otro"];

// Lo que el cliente puede pedir. Amarrar la receta a una de estas llaves es lo
// que después deja que el costeo del bowl use el costo real en vez de un
// numero capturado a mano.
const MENU_GROUPS = [
  { id: "marinado",    label: "Marinados",         tipologia: "marinado", labels: MARINADE_LABELS },
  { id: "aderezo",     label: "Aderezos y salsas", tipologia: "aderezo",  labels: SAUCE_LABELS },
  { id: "complemento", label: "Complementos",      tipologia: "mezcla",   labels: COMPLEMENT_LABELS },
  { id: "proteina",    label: "Proteínas",         tipologia: "mezcla",   labels: PROTEIN_LABELS },
];

const MENU_INDEX = new Map(
  MENU_GROUPS.flatMap((group) =>
    Object.entries(group.labels).map(([key, label]) => [key, { ...group, key, label }])
  )
);

// Marinados y aderezos se hacen todos en casa, asi que los que no tienen
// receta se listan como pendientes. Los complementos no: el mango se compra
// mango, no lleva receta.
const NEEDS_RECIPE = ["marinado", "aderezo"];

const emptyLine = () => ({
  name: "", unit: "kg", presentation: "", recipeAmount: "", unitPrice: "", flatCost: "", inventoryItemId: "",
});

const emptyDraft = () => ({
  name: "", tipologia: "aderezo", menuKey: "", yieldPortions: "", notes: "",
  ingredients: [emptyLine()],
});

const toDraft = (prep) => ({
  id: prep._id,
  name: prep.name || "",
  tipologia: prep.tipologia || "aderezo",
  menuKey: prep.menuKey || "",
  yieldPortions: String(prep.yieldPortions || ""),
  notes: prep.notes || "",
  ingredients: (prep.ingredients || []).map((l) => ({
    name: l.name || "",
    unit: l.unit || "kg",
    presentation: String(l.presentation || ""),
    recipeAmount: String(l.recipeAmount || ""),
    unitPrice: String(l.unitPrice || ""),
    flatCost: String(l.flatCost || ""),
    inventoryItemId: l.inventoryItemId || "",
  })),
});

// Misma cuenta que hace el servidor, para que el costo se vea al momento de
// capturar sin tener que guardar primero. Se redondea por línea igual que allá,
// si no el total del editor sale un centavo distinto al ya guardado.
const TO_BASE = { kg: 1000, gr: 1, lt: 1000, ml: 1, pz: 1 };
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const lineCost = (line) => {
  const flat = Number(line.flatCost) || 0;
  if (flat > 0) return round2(flat);
  const base = (Number(line.presentation) || 0) * (TO_BASE[line.unit] ?? 1);
  const recipe = Number(line.recipeAmount) || 0;
  const price = Number(line.unitPrice) || 0;
  return base > 0 && recipe > 0 && price > 0 ? round2((recipe / base) * price) : 0;
};

export default function PreparationsPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback((res) => { setData(res); setDraft(null); }, []);

  useEffect(() => {
    let alive = true;
    api.get("/api/staff/preparations")
      .then((res) => { if (alive) load(res); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al elegir a qué va en el menú se rellena el nombre y la tipología, que es
  // lo que se iba a teclear igual.
  const pickMenuKey = (key) =>
    setDraft((prev) => {
      const meta = MENU_INDEX.get(key);
      return {
        ...prev,
        menuKey: key,
        name: prev.name.trim() || (meta ? meta.label.toUpperCase() : ""),
        tipologia: meta ? meta.tipologia : prev.tipologia,
      };
    });

  const startFromMenu = (key) => {
    const meta = MENU_INDEX.get(key);
    setDraft({
      ...emptyDraft(),
      menuKey: key,
      name: meta ? meta.label.toUpperCase() : "",
      tipologia: meta?.tipologia || "aderezo",
    });
  };

  const setLine = (index, field, value) =>
    setDraft((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((line, i) => {
        if (i !== index) return line;
        if (field === "inventoryItemId") {
          const item = (data.inventory || []).find((inv) => inv.id === value);
          // Al ligar con el inventario, el precio y la unidad vienen de ahí.
          return item
            ? { ...line, inventoryItemId: value, name: line.name || item.item, unit: item.unit || line.unit, unitPrice: String(item.cost || "") }
            : { ...line, inventoryItemId: "" };
        }
        return { ...line, [field]: value };
      }),
    }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...draft,
        yieldPortions: Number(draft.yieldPortions) || 0,
        ingredients: draft.ingredients
          .filter((l) => l.name.trim())
          .map((l) => ({
            ...l,
            presentation: Number(l.presentation) || 0,
            recipeAmount: Number(l.recipeAmount) || 0,
            unitPrice: Number(l.unitPrice) || 0,
            flatCost: Number(l.flatCost) || 0,
            inventoryItemId: l.inventoryItemId || null,
          })),
      };
      load(draft.id
        ? await api.put(`/api/staff/preparations/${draft.id}`, payload)
        : await api.post("/api/staff/preparations", payload));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("¿Borrar esta receta?")) return;
    try {
      load(await api.delete(`/api/staff/preparations/${id}`));
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) return <p className={ui.muted}>Cargando recetas…</p>;
  if (!data) return <p className={ui.error}>{error || "No se pudieron cargar las recetas."}</p>;

  const batchCost = draft ? draft.ingredients.reduce((sum, l) => sum + lineCost(l), 0) : 0;
  const portions = Number(draft?.yieldPortions) || 0;

  const taken = new Set(data.preparations.map((p) => p.menuKey).filter(Boolean));
  const pendientes = MENU_GROUPS
    .filter((group) => NEEDS_RECIPE.includes(group.id))
    .map((group) => ({
      ...group,
      items: Object.entries(group.labels).filter(([key]) => !taken.has(key)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <section className={styles?.portalSurface}>
      <div className={ui.page}>
        <header className={ui.header}>
          <h2 className={ui.title}>Recetas estándar</h2>
          <p className={ui.subtitle}>
            Lo que no se compra hecho — aderezos, marinados y mezclas. Se captura una vez
            y el costo por porción se recalcula solo cuando cambia el precio de un insumo.
          </p>
        </header>

        {error && <p className={ui.error}>{error}</p>}

        {!draft && (
          <>
            <button className={ui.newBtn} type="button" onClick={() => setDraft(emptyDraft())}>
              + Nueva receta
            </button>

            {data.preparations.length === 0 ? (
              <p className={ui.muted}>Todavía no hay recetas capturadas.</p>
            ) : (
              <div className={ui.list}>
                {data.preparations.map((prep) => (
                  <article key={prep._id} className={ui.card}>
                    <div className={ui.cardHead}>
                      <div>
                        <h3>{prep.name}</h3>
                        <span className={ui.tipologia}>{prep.tipologia}</span>
                        {MENU_INDEX.has(prep.menuKey) && (
                          <span className={ui.menuLink}>{MENU_INDEX.get(prep.menuKey).label}</span>
                        )}
                      </div>
                      <div className={ui.cardActions}>
                        <button type="button" onClick={() => setDraft(toDraft(prep))}>Editar</button>
                        <button type="button" onClick={() => remove(prep._id)}>Borrar</button>
                      </div>
                    </div>

                    <div className={ui.tableWrap}>
                      <table className={ui.table}>
                        <thead>
                          <tr>
                            <th>Ingrediente</th><th>Unidad</th><th>Presentación</th>
                            <th>Receta</th><th>Precio unitario</th><th>Costo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prep.lines.map((line, i) => (
                            <tr key={i}>
                              <td>
                                {line.name}
                                {line.priceSource === "inventario" && (
                                  <span className={ui.badgeAuto}>inventario</span>
                                )}
                              </td>
                              <td>{line.flatCost > 0 ? "—" : line.unit}</td>
                              <td>{line.flatCost > 0 ? "—" : line.presentation}</td>
                              <td>{line.flatCost > 0 ? "—" : line.recipeAmount}</td>
                              <td>{line.flatCost > 0 ? "—" : money(line.unitPrice)}</td>
                              <td className={ui.cost}>{money(line.cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className={ui.totals}>
                      <div><span>Elaboración (lote)</span><strong>{money(prep.batchCost)}</strong></div>
                      <div>
                        <span>Rendimiento</span>
                        <strong>{prep.portions > 0 ? `${prep.portions} porciones` : "falta"}</strong>
                      </div>
                      <div className={prep.missingYield ? ui.pendiente : ui.destacado}>
                        <span>Costo por porción</span>
                        <strong>{prep.missingYield ? "—" : money(prep.costPerPortion)}</strong>
                      </div>
                    </div>
                    {prep.missingYield && (
                      <p className={ui.warn}>
                        Falta el rendimiento: sin saber cuántas porciones rinde el lote no se
                        puede sacar el costo por bowl.
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}

            {pendientes.length > 0 && (
              <section className={ui.pendingBlock}>
                <h3 className={ui.pendingTitle}>Sin receta todavía</h3>
                <p className={ui.subtitle}>
                  Marinados y aderezos que sí se venden pero que aún no están costeados.
                  Toca uno para capturarlo.
                </p>
                {pendientes.map((group) => (
                  <div key={group.id} className={ui.pendingGroup}>
                    <span className={ui.pendingLabel}>{group.label}</span>
                    <div className={ui.chips}>
                      {group.items.map(([key, label]) => (
                        <button key={key} type="button" className={ui.chip}
                          onClick={() => startFromMenu(key)}>
                          + {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        {draft && (
          <div className={ui.editor}>
            <div className={ui.editorHead}>
              <h3>{draft.id ? "Editar receta" : "Nueva receta"}</h3>
              <button type="button" className={ui.linkBtn} onClick={() => setDraft(null)}>Cancelar</button>
            </div>

            <div className={ui.grid}>
              <label>
                <span>Nombre</span>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Spicy Mayo" />
              </label>
              <label>
                <span>En el menú <small>a qué le pasa su costo</small></span>
                <select value={draft.menuKey} onChange={(e) => pickMenuKey(e.target.value)}>
                  <option value="">— no va en el menú —</option>
                  {MENU_GROUPS.map((group) => (
                    <optgroup key={group.id} label={group.label}>
                      {Object.entries(group.labels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                <span>Tipología</span>
                <select value={draft.tipologia} onChange={(e) => setDraft({ ...draft, tipologia: e.target.value })}>
                  {TIPOLOGIAS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label>
                <span>Rendimiento <small>porciones por lote</small></span>
                <input type="number" min="0" inputMode="decimal" value={draft.yieldPortions}
                  onChange={(e) => setDraft({ ...draft, yieldPortions: e.target.value })} placeholder="40" />
              </label>
            </div>

            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Ingrediente</th><th>Del inventario</th><th>Unidad</th>
                    <th>Presentación</th><th>Receta</th><th>Precio unitario</th>
                    <th>Costo directo</th><th>Costo</th><th />
                  </tr>
                </thead>
                <tbody>
                  {draft.ingredients.map((line, index) => (
                    <tr key={index}>
                      <td><input value={line.name} onChange={(e) => setLine(index, "name", e.target.value)} placeholder="Crema" /></td>
                      <td>
                        <select value={line.inventoryItemId} onChange={(e) => setLine(index, "inventoryItemId", e.target.value)}>
                          <option value="">— a mano —</option>
                          {(data.inventory || []).map((inv) => (
                            <option key={inv.id} value={inv.id}>{inv.item}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select value={line.unit} onChange={(e) => setLine(index, "unit", e.target.value)}>
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td><input type="number" min="0" step="0.01" value={line.presentation} onChange={(e) => setLine(index, "presentation", e.target.value)} placeholder="5" /></td>
                      <td><input type="number" min="0" step="1" value={line.recipeAmount} onChange={(e) => setLine(index, "recipeAmount", e.target.value)} placeholder="417" /></td>
                      <td>
                        <input type="number" min="0" step="0.01" value={line.unitPrice}
                          disabled={Boolean(line.inventoryItemId)}
                          onChange={(e) => setLine(index, "unitPrice", e.target.value)} placeholder="357" />
                      </td>
                      <td><input type="number" min="0" step="0.5" value={line.flatCost} onChange={(e) => setLine(index, "flatCost", e.target.value)} placeholder="—" /></td>
                      <td className={ui.cost}>{money(lineCost(line))}</td>
                      <td>
                        <button type="button" className={ui.removeRow}
                          onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, i) => i !== index) })}
                          aria-label="Quitar ingrediente">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" className={ui.linkBtn}
              onClick={() => setDraft({ ...draft, ingredients: [...draft.ingredients, emptyLine()] })}>
              + Agregar ingrediente
            </button>

            <div className={ui.totals}>
              <div><span>Elaboración (lote)</span><strong>{money(batchCost)}</strong></div>
              <div className={portions > 0 ? ui.destacado : ui.pendiente}>
                <span>Costo por porción</span>
                <strong>{portions > 0 ? money(batchCost / portions) : "falta rendimiento"}</strong>
              </div>
            </div>

            <button className={ui.saveBtn} type="button" onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar receta"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
