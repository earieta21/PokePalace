import { useState, useEffect, useContext, useCallback } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import ui from "./CostingPage.module.css";

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const pct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

// Las partes del bowl que se capturan a mano: el inventario todavía no sabe
// cuántas porciones rinde un paquete, así que esto se define una vez aquí.
// La base no va aquí: se captura por kilo + gramos en su propio bloque.
const PARTS = [
  { key: "marinades", label: "Marinados", hint: "Costo por marinado" },
  { key: "complements", label: "Complementos", hint: "Costo por complemento" },
  { key: "sauces", label: "Salsas", hint: "Costo por salsa" },
  { key: "toppings", label: "Toppings", hint: "Costo por topping" },
  { key: "packaging", label: "Empaque", hint: "Bowl, tapa, bolsa, tenedor, servilleta" },
];

const VERDICT_STYLE = {
  apto: ui.verdictOk,
  mitad: ui.verdictWarn,
  fuera: ui.verdictBad,
  sin_datos: ui.verdictMuted,
};

export default function CostingPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [view, setView] = useState("summary");
  const [savedForm, setSavedForm] = useState("");
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const dirty = Boolean(form && JSON.stringify(form) !== savedForm);

  const hydrate = useCallback((report) => {
    setData(report);
    const nextForm = {
      ...Object.fromEntries(PARTS.map(({ key }) => [key, {
        costPerUnit: String(report.config[key]?.costPerUnit ?? 0),
        unitsPerBowl: String(report.config[key]?.unitsPerBowl ?? 0),
      }])),
      baseCostPerKg: String(report.config.baseCostPerKg ?? 0),
      baseGramsPerPortion: String(report.config.baseGramsPerPortion ?? 0),
      comboDrinkCost: String(report.config.comboDrinkCost ?? 0),
      comboRiceCakeCost: String(report.config.comboRiceCakeCost ?? 0),
      promoMinMarginPct: String(report.config.promoMinMarginPct ?? 25),
      promoEligibleMinMarginPct: String(report.config.promoEligibleMinMarginPct ?? 40),
      complementCosts: Object.fromEntries(
        (report.complementUsage?.allKeys || report.complementUsage?.keys || []).map((key) => [key, {
          costPerUnit: String(report.config.complementCosts?.[key]?.costPerUnit || ""),
          portionsPerUnit: String(report.config.complementCosts?.[key]?.portionsPerUnit || ""),
        }])
      ),
      disabledProteins: report.config.disabledProteins || [],
      disabledComplements: report.config.disabledComplements || [],
      proteinCostPerKgOverride: Object.fromEntries(
        Object.keys(report.proteinLabels || {}).map((key) => [
          key,
          String(report.config.proteinCostPerKgOverride?.[key] ?? ""),
        ])
      ),
    };
    setForm(nextForm);
    setSavedForm(JSON.stringify(nextForm));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    createStaffApi(staffToken).get("/api/staff/costing")
      .then((report) => { if (alive) hydrate(report); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [staffToken, hydrate, loadVersion]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Todas las ediciones comparten borrador: cambiar disponibilidad no debe
  // reemplazar los costos que todavía se están capturando.
  const toggleIngredient = (field, key) => {
    setSavedMsg("");
    setForm((prev) => ({ ...prev, [field]: prev[field].includes(key)
      ? prev[field].filter((value) => value !== key) : [...prev[field], key] }));
  };

  const setPart = (partKey, field, value) =>
    setForm((prev) => ({ ...prev, [partKey]: { ...prev[partKey], [field]: value } }));

  const save = async () => {
    if (saving || !dirty) return;
    const inputs = document.querySelectorAll("#costing-editor input[type=number]");
    const invalid = [...inputs].find((input) => !input.validity.valid);
    if (invalid) {
      setView("costs");
      setSearch("");
      setOnlyMissing(false);
      const section = invalid.closest("details");
      if (section) section.open = true;
      setError("Revisa el campo señalado: usa un número válido, mayor o igual a cero. Los porcentajes no pueden superar 100.");
      requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); });
      return;
    }
    setSaving(true);
    setError("");
    setSavedMsg("");
    try {
      const payload = {
        ...Object.fromEntries(PARTS.map(({ key }) => [key, {
          costPerUnit: Number(form[key].costPerUnit) || 0,
          unitsPerBowl: Number(form[key].unitsPerBowl) || 0,
        }])),
        baseCostPerKg: Number(form.baseCostPerKg) || 0,
        baseGramsPerPortion: Number(form.baseGramsPerPortion) || 0,
        comboDrinkCost: Number(form.comboDrinkCost) || 0,
        comboRiceCakeCost: Number(form.comboRiceCakeCost) || 0,
        promoMinMarginPct: Number(form.promoMinMarginPct) || 0,
        promoEligibleMinMarginPct: Number(form.promoEligibleMinMarginPct) || 0,
        complementCosts: Object.fromEntries(
          Object.entries(form.complementCosts).map(([key, v]) => [key, {
            costPerUnit: Number(v.costPerUnit) || 0,
            portionsPerUnit: Number(v.portionsPerUnit) || 0,
          }])
        ),
        disabledProteins: form.disabledProteins,
        disabledComplements: form.disabledComplements,
        proteinCostPerKgOverride: form.proteinCostPerKgOverride,
      };
      hydrate(await api.put("/api/staff/costing", payload));
      setSavedMsg("Guardado. Los márgenes ya están actualizados.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className={ui.muted}>Cargando costeo…</p>;
  if (!data || !form) return <div className={ui.page}><p className={ui.error} role="alert">{error || "No se pudo cargar el costeo."}</p><button type="button" className={ui.secondaryBtn} onClick={() => setLoadVersion((value) => value + 1)}>Reintentar</button></div>;

  const bowls = data.bowls || [];
  const usage = data.complementUsage || {};
  const missingCosts = bowls.filter((b) => b.proteinSource === "falta");
  const zeroParts = [
    ...(!bowls[0]?.rows.base ? ["base"] : []),
    ...PARTS.filter(({ key }) => !bowls[0]?.rows[key]).map(({ label }) => label.toLowerCase()),
  ];
  const incompleteComplements = (usage.keys || []).filter((key) =>
    (usage.frequency?.[key] || 0) > 0 && !(data.complementCosts?.[key]?.costPerPortion > 0)
  );
  // Cuántos de cada cosa lleva un bowl de verdad, para no capturar a ojo.
  const realAvg = usage.averagePerBowl || {};
  const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visibleComplements = (usage.keys || []).filter((key) => {
    const matches = normalize(usage.labels?.[key] || key).includes(normalize(search));
    const resolved = data.complementCosts?.[key] || {};
    const entry = form.complementCosts?.[key] || {};
    const inventoryCost = resolved.inventoryCostPerUnit ?? (resolved.source === "inventario" ? resolved.costPerUnit : 0);
    const missing = !(Number(entry.costPerUnit) > 0 || inventoryCost > 0)
      || !(Number(entry.portionsPerUnit) > 0);
    return matches && (!onlyMissing || missing);
  });

  return (
    <section className={styles?.portalSurface}>
      <div className={ui.page}>
        <header className={ui.header}>
          <h2 className={ui.title}>Costeo de bowls</h2>
          <p className={ui.subtitle}>Consulta el margen de tus bowls y actualiza costos y porciones en un solo lugar. Todos los importes están en MXN.</p>
        </header>

        <nav className={ui.tabs} aria-label="Secciones de costeo">
          {[["summary", "Resumen"], ["costs", "Editar costos"], ["ingredients", "Ingredientes del menú"]].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>
          ))}
        </nav>
        {error && <p className={ui.error} role="alert">{error}</p>}
        {savedMsg && !dirty && <p className={ui.success} role="status">{savedMsg}</p>}

        <div hidden={view !== "summary"}>
        <div className={ui.overview}>
          <div><span className={ui.eyebrow}>Costo por bowl mediano</span><h3 className={ui.sectionTitle}>¿Cuánto te deja cada proteína?</h3>
          <p className={ui.subtitle}>Cada opción supone un bowl con una sola proteína ({(bowls[0]?.proteinKg ?? 0.1) * 1000} g). El margen es antes de renta, nómina y otros gastos.</p></div>
          <button type="button" className={ui.secondaryBtn} onClick={() => setView("costs")}>Actualizar costos →</button>
        </div>
        {dirty && <p className={ui.warnBox}>Tienes cambios pendientes. Este resumen muestra los últimos costos guardados.</p>}
        {bowls.length > 0 && zeroParts.length > 0 && <p className={ui.warnBox}>Costos en cero: {zeroParts.join(", ")}. Revisa si faltan datos; el margen puede parecer mayor al real.</p>}
        {incompleteComplements.length > 0 && <div className={ui.warnBox}>
          <p>Hay {incompleteComplements.length} complemento(s) con uso registrado sin costo por porción. Completa sus costos y rendimientos antes de tomar decisiones con estos márgenes.</p>
          <button type="button" className={ui.secondaryBtn} onClick={() => { setView("costs"); setOnlyMissing(true); setSearch(""); requestAnimationFrame(() => { const section = document.getElementById("costing-complements"); if (section) { section.open = true; section.scrollIntoView({ block: "start" }); } }); }}>Revisar complementos pendientes →</button>
        </div>}

        {missingCosts.length > 0 && (
          <div className={ui.warnBox}>
            <strong>Faltan costos de proteína:</strong>
            <ul>
              {missingCosts.map((b) => (
                <li key={b.proteinKey}>{b.label} — {b.proteinNote}</li>
              ))}
            </ul>
            <button type="button" className={ui.secondaryBtn} onClick={() => { setView("costs"); requestAnimationFrame(() => { const section = document.getElementById("costing-proteins"); if (section) { section.open = true; section.scrollIntoView({ block: "center" }); section.querySelector("input")?.focus({ preventScroll: true }); } }); }}>Completar costos de proteína →</button>
          </div>
        )}

        {bowls.length === 0 && <p className={ui.warnBox}>No hay proteínas activas. Actívalas en Ingredientes del menú para ver su costeo.</p>}
        <div className={ui.bowlCards}>
          {bowls.map((b) => {
            const missing = b.proteinSource === "falta";
            return <article key={b.proteinKey} className={ui.bowlCard}>
              <div className={ui.complementHead}><h3>{b.label}</h3><span className={ui.badge}>{missing ? "Falta costo" : b.proteinSource === "inventario" ? "Inventario" : "Costo manual"}</span></div>
              <dl><div><dt>Costo estimado</dt><dd>{missing ? "Por completar" : money(b.total)}</dd></div><div><dt>Precio de venta</dt><dd>{money(b.price)}</dd></div>
              <div className={ui.cardMargin}><dt>Margen por bowl</dt><dd>{missing ? "—" : <>{money(b.margin)} <small>{pct(b.marginPct)}</small></>}</dd></div></dl>
              <p className={`${ui.verdict} ${VERDICT_STYLE[missing || incompleteComplements.length ? "sin_datos" : b.verdict.status]}`}>{missing ? "Captura el costo de esta proteína para evaluar su margen." : incompleteComplements.length ? "Estimación parcial: completa los costos de complementos para evaluar promociones." : b.verdict.message}</p>
            </article>;
          })}
        </div>

        {/* ---- Tabla principal: la del documento de estrategia ---- */}
        <details className={ui.disclosure}>
        <summary>Ver desglose por ingrediente y comparar proteínas</summary>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th className={ui.stickyCol}>Concepto</th>
                {bowls.map((b) => (
                  <th key={b.proteinKey}>
                    {b.label}
                    <span className={ui.sold}>{b.sold30d} registros / 30d</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={ui.stickyCol}>
                  Base
                  {data.config.baseGramsPerPortion > 0 && (
                    <span className={ui.hint}>{data.config.baseGramsPerPortion} g</span>
                  )}
                </td>
                {bowls.map((b) => <td key={b.proteinKey}>{money(b.rows.base)}</td>)}
              </tr>
              <tr>
                <td className={ui.stickyCol}>
                  Proteína <span className={ui.hint}>{(bowls[0]?.proteinKg ?? 0) * 1000} g</span>
                </td>
                {bowls.map((b) => (
                  <td key={b.proteinKey}>
                    {b.proteinSource === "falta" ? "Sin costo" : money(b.rows.protein)}
                    <span className={`${ui.badge} ${b.proteinSource === "inventario" ? ui.badgeAuto : ui.badgeManual}`}>
                      {b.proteinSource === "inventario" ? "auto" : b.proteinSource}
                    </span>
                  </td>
                ))}
              </tr>
              {["marinades", "complements", "sauces", "toppings", "packaging"].map((key) => (
                <tr key={key}>
                  <td className={ui.stickyCol}>{PARTS.find((p) => p.key === key).label}</td>
                  {bowls.map((b) => <td key={b.proteinKey}>{money(b.rows[key])}</td>)}
                </tr>
              ))}
              <tr className={ui.totalRow}>
                <td className={ui.stickyCol}>Costo total del bowl</td>
                {bowls.map((b) => <td key={b.proteinKey}>{b.proteinSource === "falta" ? "Incompleto" : money(b.total)}</td>)}
              </tr>
              <tr>
                <td className={ui.stickyCol}>Precio de venta</td>
                {bowls.map((b) => <td key={b.proteinKey}>{money(b.price)}</td>)}
              </tr>
              <tr className={ui.marginRow}>
                <td className={ui.stickyCol}>Margen $ / %</td>
                {bowls.map((b) => (
                  <td key={b.proteinKey} className={b.marginPct >= 40 ? ui.good : b.marginPct >= 25 ? ui.ok : ui.bad}>
                    {b.proteinSource === "falta" ? "—" : <>{money(b.margin)} <span className={ui.pctChip}>{pct(b.marginPct)}</span></>}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={ui.stickyCol}>Costo de producto (food cost)</td>
                {bowls.map((b) => <td key={b.proteinKey}>{b.proteinSource === "falta" ? "—" : pct(b.foodCostPct)}</td>)}
              </tr>
              <tr>
                <td className={ui.stickyCol}>Margen en 2x1 <span className={ui.hint}>$125 c/u</span></td>
                {bowls.map((b) => (
                  <td key={b.proteinKey} className={b.scenarios.promo2x1.marginPct >= 25 ? ui.ok : ui.bad}>
                    {b.proteinSource === "falta" ? "—" : <>{money(b.scenarios.promo2x1.margin)} <span className={ui.pctChip}>{pct(b.scenarios.promo2x1.marginPct)}</span></>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        </details>

        {/* ---- Margen real ponderado ---- */}
        {data.weighted && missingCosts.length === 0 && (
          <div className={ui.weighted}>
            <h3 className={ui.sectionTitle}>Estimación según las proteínas más pedidas</h3>
            <p className={ui.subtitle}>
              Usa {data.weighted.units} registros de proteínas de los últimos {data.salesMixWindowDays} días y los costos actuales. Un bowl puede registrar varias proteínas; estos importes no son las ventas ni la utilidad contable del periodo.
            </p>
            <div className={ui.kpis}>
              <div className={ui.kpi}><span>Venta estimada</span><strong>{money(data.weighted.revenue)}</strong></div>
              <div className={ui.kpi}><span>Costo de producto</span><strong>{money(data.weighted.cost)}</strong></div>
              <div className={ui.kpi}><span>Margen</span><strong>{money(data.weighted.margin)}</strong></div>
              <div className={ui.kpi}><span>Margen %</span><strong>{pct(data.weighted.marginPct)}</strong></div>
              <div className={ui.kpi}><span>Costo / venta</span><strong>{pct(data.weighted.foodCostPct)}</strong></div>
            </div>
          </div>
        )}

        {/* ---- Combo Palace ---- */}
        {data.combo && !missingCosts.some((b) => b.label === data.combo.basedOn) && (
          <div className={ui.combo}>
            <h3 className={ui.sectionTitle}>Combo Palace</h3>
            <p className={ui.subtitle}>Bowl ({data.combo.basedOn}) + bebida + rice cake, contra el precio de {money(data.combo.price)}.</p>
            <div className={ui.kpis}>
              <div className={ui.kpi}><span>Costo</span><strong>{money(data.combo.total)}</strong></div>
              <div className={ui.kpi}><span>Margen</span><strong>{money(data.combo.margin)}</strong></div>
              <div className={ui.kpi}><span>Margen %</span><strong>{pct(data.combo.marginPct)}</strong></div>
            </div>
          </div>
        )}
        </div>

        {/* ---- Captura ---- */}
        <fieldset id="costing-editor" className={ui.editor} disabled={saving} hidden={view !== "costs"}>
          <h3 className={ui.sectionTitle}>Costos capturados</h3>
          <p className={ui.subtitle}>
            Cuánto cuesta cada parte y cuántas van en un bowl. Para sacar el costo por porción:
            lo que costó el paquete ÷ cuántas porciones rinde.
          </p>

          <details className={ui.disclosure} open>
          <summary>1. Base y costos por bowl <small>Porciones, salsas y empaque</small></summary>
          <div className={ui.baseBlock}>
            <label>Base <span className={ui.hint}>Arroz, quinoa o ensalada</span></label>
            <div className={ui.baseRow}>
              <div className={ui.field}>
                <span className={ui.hint}>Costo por kilo</span>
                <input
                  type="number" min="0" step="any" inputMode="decimal"
                  value={form.baseCostPerKg}
                  onChange={(e) => setForm((p) => ({ ...p, baseCostPerKg: e.target.value }))}
                  aria-label="Costo por kilo de la base"
                />
              </div>
              <div className={ui.field}>
                <span className={ui.hint}>Gramos por porción</span>
                <input
                  type="number" min="0" step="any" inputMode="decimal"
                  value={form.baseGramsPerPortion}
                  onChange={(e) => setForm((p) => ({ ...p, baseGramsPerPortion: e.target.value }))}
                  aria-label="Gramos por porción de la base"
                />
              </div>
              <div className={ui.baseResult}>
                <span className={ui.hint}>Costo por porción</span>
                <strong>
                  {money(((Number(form.baseCostPerKg) || 0) / 1000) * (Number(form.baseGramsPerPortion) || 0))}
                </strong>
              </div>
            </div>
          </div>

          <div className={ui.grid}>
            {PARTS.map(({ key, label, hint }) => (
              <div key={key} className={ui.field}>
                <label>{label}</label>
                <span className={ui.hint}>
                  {hint}
                  {realAvg[key] !== undefined && ` · promedio real: ${realAvg[key]} por bowl`}
                </span>
                <div className={ui.inputRow}>
                  <label><span className={ui.hint}>Costo ($)</span>
                  <input
                    type="number" min="0" step="any" inputMode="decimal"
                    value={form[key].costPerUnit}
                    onChange={(e) => setPart(key, "costPerUnit", e.target.value)}
                    aria-label={`Costo por unidad de ${label}`}
                  />
                  </label>
                  <span className={ui.times}>×</span>
                  <label><span className={ui.hint}>Por bowl</span>
                  <input
                    type="number" min="0" step="any" inputMode="decimal"
                    value={form[key].unitsPerBowl}
                    onChange={(e) => setPart(key, "unitsPerBowl", e.target.value)}
                    aria-label={`Unidades por bowl de ${label}`}
                  />
                  </label>
                  <span className={ui.subtotal}>
                    = {money((Number(form[key].costPerUnit) || 0) * (Number(form[key].unitsPerBowl) || 0))}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className={ui.hint}>El costo general de complementos se usa como respaldo cuando no hay costos individuales disponibles.</p>

          </details>
          <details id="costing-complements" className={ui.disclosure} open>
          <summary>2. Complementos <small>Costo de compra y rendimiento</small></summary>
          <h4 className={ui.subhead}>
            Costo por complemento
            <span className={ui.hint}>
              Pon lo que te cuesta la unidad que compras (kilo, pieza o paquete) y cuántas
              porciones rinde — la app saca el costo por porción. El costo sale del inventario
              cuando ya está capturado ahí. Se pondera por qué tan seguido lo piden, según
              {" "}{usage.bowls} bowls reales de los últimos {usage.windowDays} días.
            </span>
          </h4>
          <div className={ui.filters}>
            <label>Buscar complemento<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ej. aguacate, pepino…" /></label>
            <label className={ui.checkbox}><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Solo pendientes de completar</label>
          </div>
          {visibleComplements.length === 0 && <p className={ui.muted}>No hay complementos que coincidan con estos filtros.</p>}
          <div className={ui.complementGrid}>
            {(usage.keys || []).map((key) => {
              const label = usage.labels?.[key] || key;
              const freq = usage.frequency?.[key] || 0;
              const resolved = data.complementCosts?.[key] || {};
              const entry = form.complementCosts?.[key] || {};
              const inventoryCost = resolved.inventoryCostPerUnit ?? (resolved.source === "inventario" ? resolved.costPerUnit : 0);
              const costPerUnit = Number(entry.costPerUnit) || inventoryCost || 0;
              const portions = Number(entry.portionsPerUnit) || 0;
              const perPortion = costPerUnit > 0 && portions > 0 ? costPerUnit / portions : 0;
              return (
                <div key={key} className={ui.complementCard} hidden={!visibleComplements.includes(key)}>
                  <div className={ui.complementHead}>
                    <span className={ui.complementLabel}>{label}</span>
                    <span className={ui.freq}>{Math.round(freq * 100)}% de los bowls</span>
                  </div>
                  <div className={ui.complementInputs}>
                    <label>
                      <span className={ui.hint}>
                        Costo por {resolved.unit || "unidad"}
                        {!Number(entry.costPerUnit) && inventoryCost > 0 && " · del inventario"}
                      </span>
                      <input
                        type="number" min="0" step="any" inputMode="decimal"
                        placeholder={inventoryCost ? String(inventoryCost) : "0"}
                        value={entry.costPerUnit ?? ""}
                        onChange={(e) => setForm((p) => ({
                          ...p,
                          complementCosts: {
                            ...p.complementCosts,
                            [key]: { ...p.complementCosts[key], costPerUnit: e.target.value },
                          },
                        }))}
                        aria-label={`Costo por unidad de ${label}`}
                      />
                    </label>
                    <label>
                      <span className={ui.hint}>Porciones que rinde</span>
                      <input
                        type="number" min="0" step="any" inputMode="decimal"
                        placeholder="0"
                        value={entry.portionsPerUnit ?? ""}
                        onChange={(e) => setForm((p) => ({
                          ...p,
                          complementCosts: {
                            ...p.complementCosts,
                            [key]: { ...p.complementCosts[key], portionsPerUnit: e.target.value },
                          },
                        }))}
                        aria-label={`Porciones por unidad de ${label}`}
                      />
                    </label>
                  </div>
                  <div className={ui.complementFoot}>
                    <span>{costPerUnit > 0 && portions > 0 ? `${money(perPortion)} por porción` : "Falta costo o rendimiento"}</span>
                    <strong title="Costo por porción multiplicado por la frecuencia de uso">{money(perPortion * freq)} / bowl promedio</strong>
                  </div>
                </div>
              );
            })}
          </div>
          <p className={ui.complementTotal}>
            Costo guardado de complementos por bowl promedio:
            <strong>{money(data.bowls[0]?.rows.complements || 0)}</strong>
          </p>
          </details>

          <details id="costing-proteins" className={ui.disclosure} open>
          <summary>3. Proteínas <small>Costo por kilo · inventario o captura manual</small></summary>
          <p className={ui.subtitle}>El costo del inventario se usa automáticamente. Un importe manual lo reemplaza; déjalo vacío para volver a usar el inventario.</p>
          <div className={ui.grid}>
            {bowls.map((b) => (
              <div key={b.proteinKey} className={ui.field}>
                <label>{b.label}</label>
                <span className={ui.hint}>
                  {b.proteinSource === "inventario"
                    ? `Del inventario: ${money(b.proteinCostPerKg)}/kg — déjalo vacío para seguir usándolo`
                    : "Captura el costo por kg"}
                </span>
                <input
                  type="number" min="0" step="any" inputMode="decimal" aria-label={`Costo por kilo de ${b.label}`}
                  placeholder={b.proteinSource === "inventario" ? String(b.proteinCostPerKg) : "0"}
                  value={form.proteinCostPerKgOverride[b.proteinKey] ?? ""}
                  onChange={(e) => setForm((prev) => ({
                    ...prev,
                    proteinCostPerKgOverride: { ...prev.proteinCostPerKgOverride, [b.proteinKey]: e.target.value },
                  }))}
                />
              </div>
            ))}
          </div>
          </details>
          <details className={ui.disclosure}>
          <summary>4. Combo y reglas de margen <small>Bebida, rice cake y objetivos</small></summary>

          <div className={ui.grid}>
            {[
              ["comboDrinkCost", "Costo de la bebida del combo", "Importe por bebida"],
              ["comboRiceCakeCost", "Costo del rice cake", "Importe por pieza"],
              ["promoMinMarginPct", "Margen mínimo con promoción (%)", "Por debajo de este porcentaje, la promoción no alcanza tu objetivo"],
              ["promoEligibleMinMarginPct", "Margen mínimo para entrar al 2x1 (%)", "Margen sin promoción que debe tener la proteína"],
            ].map(([key, label, hint]) => <label className={ui.field} key={key}>
              <span>{label}</span><span className={ui.hint}>{hint}</span>
              <input type="number" min="0" max={key.includes("Margin") ? 100 : undefined} step="any" inputMode="decimal" value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />
            </label>)}
          </div>
          </details>
        </fieldset>

        <fieldset className={ui.editor} disabled={saving} hidden={view !== "ingredients"}>
          <h4 className={ui.subhead}>
            Ingredientes que manejas
            <span className={ui.hint}>
              Apaga los que no vendes: desaparecen del costeo <strong>y dejan de ofrecerse</strong>
              {" "}a los clientes en el sitio, el kiosco y el POS al guardar. Puedes volver a activarlos — para algo
              agotado solo hoy, usa la pestaña Tienda.
            </span>
          </h4>
          <div className={ui.toggleGrid}>
            {Object.entries(data.proteinLabels || {}).map(([key, label]) => {
              const off = (form.disabledProteins || []).includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`${ui.ingredientToggle} ${off ? ui.ingredientOff : ""}`}
                  aria-pressed={!off}
                  onClick={() => toggleIngredient("disabledProteins", key)}
                >
                  <span>{off ? "○" : "●"}</span> {label}
                </button>
              );
            })}
            {(usage.allKeys || []).map((key) => {
              const off = (form.disabledComplements || []).includes(key);
              const freq = usage.frequency?.[key];
              return (
                <button
                  key={key}
                  type="button"
                  className={`${ui.ingredientToggle} ${off ? ui.ingredientOff : ""}`}
                  aria-pressed={!off}
                  onClick={() => toggleIngredient("disabledComplements", key)}
                >
                  <span>{off ? "○" : "●"}</span> {usage.labels?.[key] || key}
                  {freq === 0 && !off && <em className={ui.neverUsed}>sin registros</em>}
                </button>
              );
            })}
          </div>

        </fieldset>
        <footer className={`${ui.saveBar} ${!dirty ? ui.saveBarIdle : ""}`}>
          <div role="status"><strong>{saving ? "Guardando cambios…" : dirty ? "Tienes cambios sin guardar" : "Costos guardados"}</strong>
          <span>{dirty ? "Guarda para recalcular los márgenes y aplicar los cambios del menú." : data.config.updatedAt ? `Actualizado: ${new Date(data.config.updatedAt).toLocaleString("es-MX")}${data.config.updatedBy ? ` · ${data.config.updatedBy}` : ""}` : "Edita un costo para comenzar."}</span></div>
          <div className={ui.saveActions}>
            {dirty && <button type="button" className={ui.secondaryBtn} disabled={saving} onClick={() => { if (window.confirm("¿Descartar todos los cambios sin guardar?")) { hydrate(data); setError(""); setSavedMsg(""); } }}>Descartar</button>}
            <button type="button" className={ui.saveBtn} onClick={save} disabled={saving || !dirty}>{saving ? "Guardando…" : "Guardar cambios"}</button>
          </div>
        </footer>
      </div>
    </section>
  );
}
