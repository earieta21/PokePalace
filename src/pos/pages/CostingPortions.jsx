import { useEffect, useMemo, useState } from "react";
import {
  BASE_LABELS, COMPLEMENT_LABELS, SAUCE_LABELS, MARINADE_LABELS, TOPPING_LABELS, PROTEIN_LABELS,
} from "../../order/OrderLabels";
import { measureOf } from "../../../backend/utils/portionCost.js";
import {
  CATEGORY_BY_KEY, chipLabel, emptyPortion, initialPortion, money, pendingSteps, portionToPayload,
  previewPortion, unitLabel,
} from "./costingPortionsModel";
import ui from "./CostingPortions.module.css";

/* "¿Cuánto lleva una porción?" — la única pregunta que se le hace a quien
   captura. El precio de compra sale del inventario (se actualiza cada vez que
   se recibe mercancía) y la app multiplica. Nadie divide paquetes entre
   porciones a mano. */

/** Lo que se pregunta para el precio: de dónde sale y, si hace falta, cuánto trae cada pieza. */
function PriceFields({ entry, item, inventoryOptions, inventoryById, onChange, preview, idPrefix }) {
  const auto = item?.autoItemId ? inventoryById.get(item.autoItemId) : null;
  const selection = entry.inventoryItemId || (entry.useManualPrice && auto ? "manual" : "auto");
  const chosen = preview?.chosen;
  const showManual = selection === "manual" || (selection === "auto" && !(auto && auto.cost > 0));
  const piecePrice = chosen && measureOf(chosen.unit).kind === "piece" && entry.unit !== "pz";

  const pickSource = (value) => onChange(
    value === "auto" ? { inventoryItemId: "", useManualPrice: false }
      : value === "manual" ? { inventoryItemId: "", useManualPrice: true }
        : { inventoryItemId: value, useManualPrice: false }
  );

  return (
    <div className={ui.priceBlock}>
      <label className={ui.sourceField}>
        <span>Precio de compra</span>
        <select id={`${idPrefix}-source`} value={selection} onChange={(e) => pickSource(e.target.value)}>
          <option value="auto">
            {auto ? `Inventario: ${auto.item}${auto.cost > 0 ? ` · ${money(auto.cost)} por ${auto.unit}` : " · sin costo"}` : "Escribirlo aquí abajo"}
          </option>
          {auto && <option value="manual">Escribirlo a mano</option>}
          <optgroup label="Tomarlo de otro artículo del inventario">
            {inventoryOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.item}{option.cost > 0 ? ` · ${money(option.cost)} por ${option.unit}` : " · sin costo"}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {chosen?.source === "inventario" && (
        <p className={ui.note}>Se actualiza solo cada vez que se recibe mercancía con su precio.</p>
      )}
      {showManual && (
        <div className={ui.row}>
          <label>
            <span>Cuánto pagas</span>
            <input type="number" min="0" step="any" inputMode="decimal" placeholder="$"
              value={entry.price} onChange={(e) => onChange({ price: e.target.value })} />
          </label>
          <label>
            <span>por cada</span>
            <select value={entry.priceUnit} onChange={(e) => onChange({ priceUnit: e.target.value })}>
              {["kg", "g", "l", "ml", "pz"].map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
            </select>
          </label>
        </div>
      )}
      {piecePrice && (
        <div className={ui.row}>
          <label>
            <span>Cada {chosen.unit} trae</span>
            <input type="number" min="0" step="any" inputMode="decimal" placeholder="Ej. 793"
              value={entry.contentAmount} onChange={(e) => onChange({ contentAmount: e.target.value })} />
          </label>
          <label>
            <span>&nbsp;</span>
            <select value={entry.contentUnit} onChange={(e) => onChange({ contentUnit: e.target.value })}>
              {["g", "ml", "kg", "l"].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

function AmountFields({ entry, category, onChange, idPrefix, autoFocus = false }) {
  const meta = CATEGORY_BY_KEY[category];
  return (
    <div>
      <div className={ui.row}>
        <label>
          <span>Una porción lleva</span>
          <input id={`${idPrefix}-amount`} type="number" min="0" step="any" inputMode="decimal" placeholder="0"
            autoFocus={autoFocus} value={entry.amount} onChange={(e) => onChange({ amount: e.target.value })} />
        </label>
        <label>
          <span>&nbsp;</span>
          <select value={entry.unit} onChange={(e) => onChange({ unit: e.target.value })}>
            <option value="g">gramos</option>
            <option value="ml">ml</option>
            <option value="pz">piezas</option>
          </select>
        </label>
      </div>
      <div className={ui.chips} aria-label="Porciones comunes">
        {meta.chips.map((chip) => (
          <button key={chipLabel(chip)} type="button"
            aria-pressed={Number(entry.amount) === chip[0] && entry.unit === chip[1]}
            onClick={() => onChange({ amount: String(chip[0]), unit: chip[1] })}>
            {chipLabel(chip)}
          </button>
        ))}
      </div>
    </div>
  );
}

function CostLine({ preview, frequency, category, hasUsage }) {
  const meta = CATEGORY_BY_KEY[category];
  const tooHigh = preview.cost > meta.warnAt;
  return (
    <div className={ui.costLine}>
      {preview.cost > 0 ? (
        <>
          <strong>{money(preview.cost)} por porción</strong>
          {hasUsage && <span>{money(preview.cost * frequency)} por bowl promedio</span>}
        </>
      ) : (
        <span className={ui.missing}>{preview.reason || "Falta información"}</span>
      )}
      {tooHigh && (
        <p className={ui.warn} role="alert">
          ⚠ {money(preview.cost)} por porción es mucho para {meta.label.toLowerCase()}. ¿Pusiste el precio de un paquete
          o la cantidad de todo un lote en lugar de una porción?
        </p>
      )}
    </div>
  );
}

/** Tarjeta de una opción del menú (pepino, spicy mayo, ajonjolí…). */
export function PortionCard({ item, category, entry, onChange, inventoryOptions, inventoryById, hasUsage, onOpenRecipes }) {
  const meta = CATEGORY_BY_KEY[category];
  const label = meta.labels[item.key] || item.key;
  const preview = previewPortion({ entry, item, inventoryById, category });
  const idPrefix = `portion-${item.key}`;

  return (
    <article className={`${ui.card} ${preview.cost > 0 ? "" : ui.cardMissing}`}>
      <header className={ui.cardHead}>
        <h4>{label}</h4>
        <span className={ui.freq}>{hasUsage ? `${Math.round(item.frequency * 100)}% de los bowls` : "sin ventas registradas"}</span>
      </header>

      {item.source === "receta" || item.recipeId ? (
        <div className={ui.recipeBox}>
          <span>Receta: <strong>{item.recipeName}</strong></span>
          {item.recipeMissingYield ? (
            <p className={ui.missing}>Falta cuántas porciones rinde un lote. Complétalo en el asistente o en Recetas.</p>
          ) : (
            <p className={ui.note}>El costo sale de la receta y se recalcula solo cuando cambia el precio de un ingrediente.</p>
          )}
          {onOpenRecipes && <button type="button" className={ui.linkBtn} onClick={onOpenRecipes}>Abrir Recetas →</button>}
        </div>
      ) : (
        <>
          <AmountFields entry={entry} category={category} onChange={onChange} idPrefix={idPrefix} />
          <PriceFields entry={entry} item={item} inventoryOptions={inventoryOptions} inventoryById={inventoryById}
            onChange={onChange} preview={preview} idPrefix={idPrefix} />
        </>
      )}
      {preview.source === "anterior" && (
        <p className={ui.note}>Usa el costo que se capturó antes (unidad ÷ porciones). Escribe la porción para cambiarlo.</p>
      )}
      <CostLine preview={preview} frequency={item.frequency} category={category} hasUsage={hasUsage} />
    </article>
  );
}

/** Un grupo (Base, Complementos…) con sus tarjetas, lo pedido primero. */
export function PortionSection({ category, items, part, form, setPortion, inventoryOptions, inventoryById, hasUsage, search, onlyMissing, onOpenRecipes, onClearLegacy, legacyCleared = false }) {
  const meta = CATEGORY_BY_KEY[category];
  const normalize = (value) => String(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visible = items.filter((item) => {
    const label = meta.labels[item.key] || item.key;
    if (search && !normalize(label).includes(normalize(search))) return false;
    if (onlyMissing && previewPortion({ entry: form[item.key], item, inventoryById, category }).cost > 0) return false;
    return true;
  });
  const used = visible.filter((item) => !hasUsage || item.frequency > 0 || Number(form[item.key]?.amount) > 0 || item.recipeId);
  const rest = visible.filter((item) => !used.includes(item));
  const withCost = items.filter((item) => item.frequency > 0 && item.costPerPortion > 0).length;
  const sold = items.filter((item) => item.frequency > 0).length;

  if (visible.length === 0) return null;
  const card = (item) => (
    <PortionCard key={item.key} item={item} category={category} entry={form[item.key] || emptyPortion(category)}
      onChange={(changes) => setPortion(item.key, changes)} inventoryOptions={inventoryOptions}
      inventoryById={inventoryById} hasUsage={hasUsage} onOpenRecipes={onOpenRecipes} />
  );

  return (
    <section className={ui.section} aria-labelledby={`portions-${category}`}>
      <header className={ui.sectionHead}>
        <div>
          <h3 id={`portions-${category}`}>{meta.label}</h3>
          <p className={ui.note}>{meta.hint}</p>
        </div>
        {part && (
          <div className={ui.sectionTotal}>
            <strong>{money(part.cost)}</strong>
            <span>por bowl promedio{hasUsage && sold > 0 ? ` · ${withCost} de ${sold} con costo` : ""}</span>
          </div>
        )}
      </header>
      {(part?.estimateFrom === "monto viejo" || (part?.source === "manual" && part.cost > 0)) && (
        <div className={ui.legacy}>
          {legacyCleared ? (
            <p>Monto anterior quitado. Guarda para que este grupo se calcule solo con las porciones.</p>
          ) : (
            <>
              <p>
                Mientras ninguna opción tenga su porción se usa un monto que se capturó antes
                {part.estimatePerPortion > 0 ? ` (${money(part.estimatePerPortion)} por porción)` : ` (${money(part.cost)} por bowl)`}.
                Si está mal, quítalo y captura las porciones.
              </p>
              <button type="button" className={ui.linkBtn} onClick={onClearLegacy}>Quitar monto anterior</button>
            </>
          )}
        </div>
      )}
      {part?.estimateFrom === "promedio" && part.missing?.length > 0 && (
        <p className={ui.note}>
          Las que aún no tienen costo se estiman con el promedio de las que sí ({money(part.estimatePerPortion)} por porción).
        </p>
      )}
      <div className={ui.grid}>{used.map(card)}</div>
      {rest.length > 0 && (
        <details className={ui.more}>
          <summary>Opciones que no se han pedido ({rest.length})</summary>
          <div className={ui.grid}>{rest.map(card)}</div>
        </details>
      )}
    </section>
  );
}

/* ---------- Pendientes, uno por uno ---------- */
function YieldCalculator({ onUse }) {
  const [batch, setBatch] = useState("");
  const [batchUnit, setBatchUnit] = useState("l");
  const [portion, setPortion] = useState("30");
  const [portionUnit, setPortionUnit] = useState("ml");
  const total = (Number(batch) || 0) * measureOf(batchUnit).base;
  const each = (Number(portion) || 0) * measureOf(portionUnit).base;
  const result = total > 0 && each > 0 ? Math.floor(total / each) : 0;
  return (
    <div className={ui.calculator}>
      <span className={ui.note}>¿No las tienes contadas? Calcúlalo:</span>
      <div className={ui.row}>
        <label><span>Un lote rinde</span>
          <input type="number" min="0" step="any" inputMode="decimal" value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="1.25" />
        </label>
        <label><span>&nbsp;</span>
          <select value={batchUnit} onChange={(e) => setBatchUnit(e.target.value)}>
            {["l", "ml", "kg", "g"].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>
      <div className={ui.row}>
        <label><span>Cada porción es de</span>
          <input type="number" min="0" step="any" inputMode="decimal" value={portion} onChange={(e) => setPortion(e.target.value)} />
        </label>
        <label><span>&nbsp;</span>
          <select value={portionUnit} onChange={(e) => setPortionUnit(e.target.value)}>
            {["ml", "g", "l", "kg"].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>
      {result > 0 && (
        <button type="button" className={ui.linkBtn} onClick={() => onUse(String(result))}>Usar {result} porciones</button>
      )}
    </div>
  );
}

/** Asistente: una pregunta a la vez, guarda al momento y pasa a la siguiente. */
export function PendingWizard({ data, api, onReport, onClose, onOpenRecipes = null }) {
  const [skipped, setSkipped] = useState(() => new Set());
  const [done, setDone] = useState(0);

  const steps = useMemo(() => pendingSteps(data).filter((step) => !skipped.has(step.id)), [data, skipped]);
  const step = steps[0];

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div className={ui.dialog}>
        <header className={ui.dialogHead}>
          <span className={ui.eyebrow}>
            {step ? `Pendiente · quedan ${steps.length}` : "Listo"}{done > 0 ? ` · ${done} guardado${done === 1 ? "" : "s"}` : ""}
          </span>
          <button type="button" className={ui.closeBtn} onClick={onClose} aria-label="Cerrar">✕</button>
        </header>

        {!step ? (
          <div className={ui.dialogBody}>
            <h3 id="wizard-title">{skipped.size > 0 ? "Ya no quedan pendientes, salvo los que saltaste." : "¡No queda nada pendiente!"}</h3>
            <p className={ui.note}>Los márgenes ya usan todo lo que capturaste.</p>
            <div className={ui.dialogActions}>
              {skipped.size > 0 && <button type="button" className={ui.secondaryBtn} onClick={() => setSkipped(new Set())}>Ver los que salté</button>}
              <button type="button" className={ui.primaryBtn} onClick={onClose}>Cerrar</button>
            </div>
          </div>
        ) : (
          // La llave reinicia lo capturado al pasar a la siguiente pregunta.
          <WizardStep
            key={step.id}
            step={step}
            data={data}
            api={api}
            onSaved={(report) => { onReport(report); setDone((n) => n + 1); }}
            onSkip={() => setSkipped((prev) => new Set([...prev, step.id]))}
            onOpenRecipes={onOpenRecipes}
          />
        )}
      </div>
    </div>
  );
}

/** Una pregunta del asistente, con lo que se va escribiendo. */
function WizardStep({ step, data, api, onSaved, onSkip, onOpenRecipes }) {
  const inventoryOptions = data.inventoryOptions || [];
  const inventoryById = new Map(inventoryOptions.map((option) => [option.id, option]));
  const [value, setValue] = useState("");
  const [entry, setEntry] = useState(() => (step.type === "portion"
    ? initialPortion({ saved: data.config?.portions?.[step.key], item: step.item, inventoryById, category: step.category })
    : null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const portionPreview = step.type === "portion"
    ? previewPortion({ entry, item: step.item, inventoryById, category: step.category })
    : null;
  const updateEntry = (changes) => setEntry((prev) => ({ ...prev, ...changes }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      let report;
      if (step.type === "portion") {
        if (!(portionPreview.cost > 0)) throw new Error(portionPreview.reason || "Completa la porción y el precio.");
        report = await api.put("/api/staff/costing", { portions: { [step.key]: portionToPayload(entry) } });
      } else if (step.type === "recipeYield") {
        if (!(Number(value) > 0)) throw new Error("Escribe cuántas porciones rinde un lote.");
        await api.patch(`/api/staff/preparations/${step.recipeId}/yield`, { yieldPortions: Number(value) });
        report = await api.get("/api/staff/costing");
      } else if (step.type === "proteinCost") {
        if (!(Number(value) > 0)) throw new Error("Escribe cuánto pagas por un kilo.");
        report = await api.put("/api/staff/costing", { proteinCostPerKgOverride: { [step.key]: Number(value) } });
      } else if (step.type === "proteinYield") {
        const grams = Number(value);
        if (!(grams >= 200 && grams <= 1000)) throw new Error("Escribe cuántos gramos quedan de 1 kg (entre 200 y 1000).");
        report = await api.put("/api/staff/costing", { proteinYieldPct: { [step.key]: Math.round(grams) / 10 } });
      }
      setSaving(false);
      onSaved(report);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className={ui.dialogBody}>
      {step.type === "portion" && (
        <>
          <h3 id="wizard-title">¿Cuánto lleva una porción de {step.label}?</h3>
          <p className={ui.note}>
            {Math.round((step.item.frequency || 0) * 100)}% de los bowls lo llevan.
            {["sauces", "marinades"].includes(step.category) ? "" : ` ${CATEGORY_BY_KEY[step.category].hint}`}
          </p>
          {["sauces", "marinades"].includes(step.category) && (
            <div className={ui.recipeBox}>
              <span>¿Se prepara en casa? Lo exacto es capturar su receta una vez; si se compra hecho, contesta aquí.</span>
              {onOpenRecipes && <button type="button" className={ui.linkBtn} onClick={onOpenRecipes}>Capturar su receta en Recetas →</button>}
            </div>
          )}
          <AmountFields entry={entry} category={step.category} idPrefix="wizard" autoFocus onChange={updateEntry} />
          <PriceFields entry={entry} item={step.item} inventoryOptions={inventoryOptions} inventoryById={inventoryById}
            onChange={updateEntry} preview={portionPreview} idPrefix="wizard" />
          <CostLine preview={portionPreview} frequency={step.item.frequency} category={step.category} hasUsage />
        </>
      )}
      {step.type === "recipeYield" && (
        <>
          <h3 id="wizard-title">¿Cuántas porciones rinde un lote de {step.recipeName}?</h3>
          <p className={ui.note}>Es lo que se usa para {step.label}. Cuenta cuántas porciones salen de una preparación completa.</p>
          <label className={ui.single}><span>Porciones por lote</span>
            <input type="number" min="1" step="any" inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <YieldCalculator onUse={setValue} />
        </>
      )}
      {step.type === "proteinCost" && (
        <>
          <h3 id="wizard-title">¿Cuánto pagas por un kilo de {step.label}?</h3>
          <p className={ui.note}>Lo que cuesta un kilo tal como lo compras. Si ya está en el inventario con su costo por kg, se toma de ahí solo.</p>
          <label className={ui.single}><span>Costo por kg ($)</span>
            <input type="number" min="0" step="any" inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
        </>
      )}
      {step.type === "proteinYield" && (
        <>
          <h3 id="wizard-title">De 1 kg de {step.label}, ¿cuántos gramos quedan listos para servir?</h3>
          <p className={ui.note}>Pésalo una vez antes y después de limpiarlo (quitar piel, sangre, recortes). Tofu o camarón cocido: 1000.</p>
          <label className={ui.single}><span>Gramos que quedan</span>
            <input type="number" min="200" max="1000" step="any" inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="850" />
          </label>
          {Number(value) > 0 && <p className={ui.note}>Rendimiento: {Math.round(Number(value) / 10)}%</p>}
        </>
      )}
      {error && error !== portionPreview?.reason && <p className={ui.error} role="alert">{error}</p>}
      <div className={ui.dialogActions}>
        <button type="button" className={ui.secondaryBtn} onClick={onSkip} disabled={saving}>Saltar</button>
        <button type="button" className={ui.primaryBtn} onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar y seguir"}</button>
      </div>
    </div>
  );
}

/* ---------- Cargar la hoja de insumos ---------- */

const PORTION_NAMES = { ...COMPLEMENT_LABELS, ...TOPPING_LABELS, ...SAUCE_LABELS, ...MARINADE_LABELS, ...BASE_LABELS, ...PROTEIN_LABELS };
const ACTION_LABEL = { crear: "Se agrega", agregar: "Se agrega al costeo", existe: "Ya está — no se toca" };

export function TemplateDialog({ plan, onApply, onClose, applying, error }) {
  const groups = [
    ["Recetas (sin rendimiento: se completa después)", plan.recipes.map((r) => ({ id: r.menuKey, name: r.name, action: r.action }))],
    ["Porciones y precios", plan.portions.map((p) => ({
      id: p.key,
      name: `${PORTION_NAMES[p.key] || p.key}: ${p.unit === "pz" && p.amount === 0.25 ? "¼ pieza" : `${p.amount} ${p.unit}`}${p.price ? ` · ${money(p.price)} por ${unitLabel(p.priceUnit)}` : ""}`,
      action: p.action,
    }))],
    ["Desechables", plan.disposables.map((d) => ({ id: d.name, name: d.existingName ? `${d.name} (ya existe como "${d.existingName}")` : d.name, action: d.action }))],
  ];
  return (
    <div className={ui.overlay} role="dialog" aria-modal="true" aria-labelledby="template-title">
      <div className={ui.dialog}>
        <header className={ui.dialogHead}>
          <span className={ui.eyebrow}>Hoja POKE PALACE INV INSUMOS</span>
          <button type="button" className={ui.closeBtn} onClick={onClose} aria-label="Cerrar">✕</button>
        </header>
        <div className={ui.dialogBody}>
          <h3 id="template-title">Cargar los datos de la hoja de insumos</h3>
          <p className={ui.note}>
            Solo se llena lo que está vacío; nada de lo ya capturado se cambia. Si el inventario tiene el artículo con
            precio, ese precio manda y se actualiza solo.
          </p>
          {groups.map(([title, rows]) => (
            <div key={title} className={ui.planGroup}>
              <strong>{title}</strong>
              <ul>
                {rows.map((row) => (
                  <li key={row.id} className={row.action === "existe" ? ui.planSkip : ""}>
                    <span>{row.name}</span><small>{ACTION_LABEL[row.action]}</small>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {error && <p className={ui.error} role="alert">{error}</p>}
          <div className={ui.dialogActions}>
            <button type="button" className={ui.secondaryBtn} onClick={onClose} disabled={applying}>Cancelar</button>
            <button type="button" className={ui.primaryBtn} onClick={onApply} disabled={applying || plan.pending === 0}>
              {applying ? "Cargando…" : `Cargar ${plan.pending} dato${plan.pending === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
