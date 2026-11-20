import { useState, useEffect, useContext, useCallback } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import {
  BASE_LABELS, MARINADE_LABELS, SAUCE_LABELS, COMPLEMENT_LABELS, PROTEIN_LABELS, TOPPING_LABELS,
} from "../../order/OrderLabels";
import { createStaffApi } from "../api";
import { isMeasurable, measureOf } from "../../../backend/utils/portionCost.js";
import ui from "./PreparationsPage.module.css";

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const UNITS = ["kg", "gr", "lt", "ml", "pz"];
const TIPOLOGIAS = ["aderezo", "marinado", "mezcla", "otro"];

// Lo que el cliente puede pedir. Amarrar la receta a una de estas llaves es lo
// que después deja que el costeo del bowl use el costo real en vez de un
// numero capturado a mano.
// "mixed_greens" es un nombre viejo de la misma ensalada (spring_mix): no se
// ofrece aparte para no tener dos recetas de lo mismo.
const MENU_BASE_LABELS = Object.fromEntries(
  Object.entries(BASE_LABELS).filter(([key]) => key !== "mixed_greens")
);

const MENU_GROUPS = [
  { id: "base",        label: "Bases",             tipologia: "mezcla",   labels: MENU_BASE_LABELS },
  { id: "marinado",    label: "Marinados",         tipologia: "marinado", labels: MARINADE_LABELS },
  { id: "aderezo",     label: "Aderezos y salsas", tipologia: "aderezo",  labels: SAUCE_LABELS },
  { id: "complemento", label: "Complementos",      tipologia: "mezcla",   labels: COMPLEMENT_LABELS },
  { id: "topping",     label: "Toppings",          tipologia: "otro",     labels: TOPPING_LABELS },
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

// Misma cuenta que hace el servidor (backend/utils/preparationCost.js), para
// que el costo se vea al momento de capturar sin tener que guardar primero.
// Se redondea por línea igual que allá, si no el total del editor sale un
// centavo distinto al ya guardado.
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Ligada al inventario, la línea toma el precio de UNA unidad del inventario
// (un kg, un litro, una pieza). Si se compra por peso o volumen la
// presentación es esa unidad; si se compra por pieza, la presentación dice
// cuánto trae cada pieza.
const liveLine = (line, inventoryById) => {
  const linked = line.inventoryItemId ? inventoryById.get(line.inventoryItemId) : null;
  if (!linked) return line;
  const live = { ...line, unitPrice: Number(linked.cost) || 0 };
  if (isMeasurable(linked.unit)) return { ...live, unit: linked.unit, presentation: 1 };
  return isMeasurable(line.unit) ? live : { ...live, unit: linked.unit, presentation: Number(line.presentation) || 1 };
};

const lineCost = (line) => {
  const flat = Number(line.flatCost) || 0;
  if (flat > 0) return round2(flat);
  const base = (Number(line.presentation) || 0) * measureOf(line.unit).base;
  const recipe = Number(line.recipeAmount) || 0;
  const price = Number(line.unitPrice) || 0;
  return base > 0 && recipe > 0 && price > 0 ? round2((recipe / base) * price) : 0;
};

// Más de esto por línea o por porción casi siempre es un error de captura
// (precio de un paquete donde iba el de un kilo, kilos donde iban gramos…).
const LINE_WARN_AT = 500;
const PORTION_WARN_AT = 20;

/** "Un lote rinde 1.25 L y la porción es de 30 ml" → 41 porciones. */
function YieldHelper({ onUse }) {
  const [batch, setBatch] = useState("");
  const [batchUnit, setBatchUnit] = useState("lt");
  const [portion, setPortion] = useState("30");
  const [portionUnit, setPortionUnit] = useState("ml");
  const total = (Number(batch) || 0) * measureOf(batchUnit).base;
  const each = (Number(portion) || 0) * measureOf(portionUnit).base;
  const result = total > 0 && each > 0 ? Math.floor(total / each) : 0;
  return (
    <div className={ui.yieldHelper}>
      <span>¿No sabes cuántas porciones rinde? Un lote da</span>
      <input type="number" min="0" step="any" inputMode="decimal" value={batch} placeholder="1.25"
        onChange={(e) => setBatch(e.target.value)} aria-label="Cuánto rinde un lote" />
      <select value={batchUnit} onChange={(e) => setBatchUnit(e.target.value)} aria-label="Unidad del lote">
        {["lt", "ml", "kg", "gr"].map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      <span>y cada porción es de</span>
      <input type="number" min="0" step="any" inputMode="decimal" value={portion}
        onChange={(e) => setPortion(e.target.value)} aria-label="Tamaño de una porción" />
      <select value={portionUnit} onChange={(e) => setPortionUnit(e.target.value)} aria-label="Unidad de la porción">
        {["ml", "gr", "lt", "kg"].map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      {result > 0 && (
        <button type="button" className={ui.linkBtn} onClick={() => onUse(String(result))}>
          = {result} porciones · usar
        </button>
      )}
    </div>
  );
}

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
          if (!item) return { ...line, inventoryItemId: "" };
          // Al ligar con el inventario el precio viene de ahí. Si se compra
          // por kg o litro, eso es la presentación (1 kg, 1 litro); si se
          // compra por pieza, falta saber cuánto trae cada una.
          const linked = { ...line, inventoryItemId: value, name: line.name || item.item, unitPrice: String(item.cost || "") };
          return isMeasurable(item.unit) ? { ...linked, unit: item.unit, presentation: "1" } : linked;
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

  const inventoryById = new Map((data.inventory || []).map((inv) => [inv.id, inv]));
  const draftLines = draft ? draft.ingredients.map((l) => liveLine(l, inventoryById)) : [];
  const batchCost = draftLines.reduce((sum, l) => sum + lineCost(l), 0);
  const portions = Number(draft?.yieldPortions) || 0;
  const draftPortionCost = portions > 0 ? batchCost / portions : 0;

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
            <YieldHelper onUse={(value) => setDraft((prev) => ({ ...prev, yieldPortions: value }))} />
            <p className={ui.hintLine}>
              Presentación: lo que trae lo que compras (5 kg, una botella de 793 gr). Receta: cuánto entra al
              lote en gramos o ml (o piezas). Si lo ligas al inventario, el precio se actualiza solo.
            </p>

            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Ingrediente</th><th>Del inventario</th><th>Unidad</th>
                    <th>Presentación</th><th>Receta <small>g, ml o pz</small></th><th>Precio unitario</th>
                    <th>Costo directo</th><th>Costo</th><th />
                  </tr>
                </thead>
                <tbody>
                  {draft.ingredients.map((line, index) => {
                    const linked = line.inventoryItemId ? inventoryById.get(line.inventoryItemId) : null;
                    const byWeight = linked && isMeasurable(linked.unit);
                    const byPiece = linked && !byWeight;
                    const live = draftLines[index];
                    const cost = lineCost(live);
                    const unitOptions = UNITS.includes(live.unit) ? UNITS : [live.unit, ...UNITS];
                    return (
                      <tr key={index} className={cost > LINE_WARN_AT ? ui.rowWarn : ""}>
                        <td><input value={line.name} onChange={(e) => setLine(index, "name", e.target.value)} placeholder="Crema" /></td>
                        <td>
                          <select value={line.inventoryItemId} onChange={(e) => setLine(index, "inventoryItemId", e.target.value)}>
                            <option value="">— a mano —</option>
                            {(data.inventory || []).map((inv) => (
                              <option key={inv.id} value={inv.id}>{inv.item}{inv.cost > 0 ? ` · ${money(inv.cost)}/${inv.unit}` : ""}</option>
                            ))}
                          </select>
                          {byWeight && <small className={ui.cellHint}>precio por {linked.unit} del inventario</small>}
                        </td>
                        <td>
                          <select value={live.unit} disabled={byWeight} onChange={(e) => setLine(index, "unit", e.target.value)}>
                            {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td>
                          <input type="number" min="0" step="any" inputMode="decimal"
                            value={byWeight ? "1" : line.presentation} disabled={byWeight}
                            onChange={(e) => setLine(index, "presentation", e.target.value)}
                            placeholder={byPiece ? "¿cuánto trae?" : "5"}
                            aria-label={byPiece ? `Cuánto trae cada ${linked.unit}, en ${line.unit}` : "Presentación"} />
                          {byPiece && <small className={ui.cellHint}>{line.unit} que trae cada {linked.unit}</small>}
                        </td>
                        <td><input type="number" min="0" step="any" inputMode="decimal" value={line.recipeAmount} onChange={(e) => setLine(index, "recipeAmount", e.target.value)} placeholder="417" /></td>
                        <td>
                          <input type="number" min="0" step="0.01" value={linked ? String(linked.cost || 0) : line.unitPrice}
                            disabled={Boolean(linked)}
                            onChange={(e) => setLine(index, "unitPrice", e.target.value)} placeholder="357" />
                        </td>
                        <td><input type="number" min="0" step="0.5" value={line.flatCost} onChange={(e) => setLine(index, "flatCost", e.target.value)} placeholder="—" /></td>
                        <td className={ui.cost}>
                          {money(cost)}
                          {cost > LINE_WARN_AT && <small className={ui.cellWarn}>¿seguro? revisa presentación y receta</small>}
                        </td>
                        <td>
                          <button type="button" className={ui.removeRow}
                            onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, i) => i !== index) })}
                            aria-label="Quitar ingrediente">×</button>
                        </td>
                      </tr>
                    );
                  })}
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
                <strong>{portions > 0 ? money(draftPortionCost) : "falta rendimiento"}</strong>
              </div>
            </div>
            {draftPortionCost > PORTION_WARN_AT && (
              <p className={ui.warn} role="alert">
                {money(draftPortionCost)} por porción es mucho para un aderezo o marinado. ¿El rendimiento está en
                porciones (no en litros) y la receta en gramos o ml?
              </p>
            )}

            <button className={ui.saveBtn} type="button" onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar receta"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
