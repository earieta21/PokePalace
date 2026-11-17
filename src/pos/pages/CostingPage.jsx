import { useState, useEffect, useContext, useCallback } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import {
  BASE_LABELS, MARINADE_LABELS, SAUCE_LABELS, TOPPING_LABELS,
} from "../../order/OrderLabels";
import { PROMO_2X1_MAX_COMPLEMENTS } from "../../order/pricing";
import { createStaffApi } from "../api";
import ui from "./CostingPage.module.css";

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const pct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

// Las partes del bowl que se capturan a mano: el inventario todavía no sabe
// cuántas porciones rinde un paquete, así que esto se define una vez aquí.
// La base no va aquí: se captura por kilo + gramos en su propio bloque. El
// empaque tampoco: se desglosa desechable por desechable en su sección.
const PARTS = [
  { key: "marinades", label: "Marinados", hint: "Costo por marinado — solo para los que aún no tienen receta" },
  { key: "complements", label: "Complementos", hint: "Respaldo: solo se usa si ningún complemento tiene costo propio" },
  { key: "sauces", label: "Salsas", hint: "Costo por salsa — solo para las que aún no tienen receta" },
  { key: "toppings", label: "Toppings", hint: "Costo por topping — solo para los que aún no tienen receta" },
];

const ROW_LABELS = {
  marinades: "Marinados",
  complements: "Complementos",
  sauces: "Salsas",
  toppings: "Toppings",
  packaging: "Desechables",
};

// Las partes que pueden costearse con receta estándar, con los nombres que ve
// el cliente para decir cuáles faltan.
const RECIPE_PART_LABELS = {
  base: { label: "Base", names: BASE_LABELS },
  marinades: { label: "Marinados", names: MARINADE_LABELS },
  sauces: { label: "Salsas", names: SAUCE_LABELS },
  toppings: { label: "Toppings", names: TOPPING_LABELS },
};

const APPLIES_TO = [
  { value: "all", label: "Todos los bowls" },
  { value: "togo", label: "Solo para llevar y delivery" },
  { value: "per_sauce", label: "Una por cada salsa" },
];

const VERDICT_STYLE = {
  apto: ui.verdictOk,
  mitad: ui.verdictWarn,
  fuera: ui.verdictBad,
  excluida: ui.verdictMuted,
  sin_datos: ui.verdictMuted,
};

const CHECK_STYLE = { ok: ui.checkOk, partial: ui.checkPartial, missing: ui.checkMissing };
const CHECK_ICON = { ok: "✓", partial: "◐", missing: "✕" };

/** Etiqueta corta de dónde sale el costo de una fila (receta, a mano…). */
function SourceBadge({ part }) {
  if (!part) return null;
  if (part.source === "receta") return <span className={`${ui.badge} ${ui.badgeAuto}`}>receta</span>;
  if (part.source === "desglose") return <span className={`${ui.badge} ${ui.badgeAuto}`}>desglose</span>;
  if (part.source === "mixto") {
    return <span className={`${ui.badge} ${ui.badgeManual}`}>{Math.round(part.coveragePct)}% receta</span>;
  }
  return <span className={`${ui.badge} ${ui.badgeManual}`}>a mano</span>;
}

/** Qué falta para que una parte quede 100% con receta, en palabras. */
function coverageText(part, names) {
  if (!part) return "";
  if (part.source === "receta") return "Todo lo que se sirve ya tiene receta estándar.";
  if (part.source === "manual") {
    return "Sin recetas todavía: se usa el costo capturado aquí. Dalas de alta en la pestaña Recetas.";
  }
  const missing = (part.missing || []).slice(0, 4)
    .map((m) => `${names?.[m.key] || m.key} (${Math.round(m.frequency * 100)}%)`)
    .join(", ");
  const more = (part.missing || []).length > 4 ? ` y ${part.missing.length - 4} más` : "";
  return `Con receta: ${Math.round(part.coveragePct)}% de lo que se sirve. Sin receta (usan el costo de aquí): ${missing}${more}.`;
}

const openSection = (id) => requestAnimationFrame(() => {
  const section = document.getElementById(id);
  if (section) { section.open = true; section.scrollIntoView({ block: "start" }); }
});

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
    const proteinKeys = Object.keys(report.proteinLabels || {});
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
        proteinKeys.map((key) => [key, String(report.config.proteinCostPerKgOverride?.[key] ?? "")])
      ),
      proteinYieldPct: Object.fromEntries(
        proteinKeys.map((key) => [key, String(report.config.proteinYieldPct?.[key] ?? "")])
      ),
      disposables: (report.config.disposables || []).map((line) => ({
        disposableId: line.disposableId,
        name: line.name,
        piecesPerPack: line.piecesPerPack,
        packPrice: String(line.packPrice || ""),
        piecesPerBowl: String(line.piecesPerBowl ?? 1),
        appliesTo: line.appliesTo || "all",
      })),
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

  const setDisposable = (index, field, value) =>
    setForm((prev) => ({
      ...prev,
      disposables: prev.disposables.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    }));

  const addDisposable = () =>
    setForm((prev) => ({
      ...prev,
      disposables: [...prev.disposables, { disposableId: "", packPrice: "", piecesPerBowl: "1", appliesTo: "all" }],
    }));

  const removeDisposable = (index) =>
    setForm((prev) => ({ ...prev, disposables: prev.disposables.filter((_, i) => i !== index) }));

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
      setError("Revisa el campo señalado: usa un número válido, mayor o igual a cero. Los porcentajes no pueden superar 100 y el rendimiento va de 20 a 100.");
      requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); });
      return;
    }
    if (form.disposables.some((line) => !line.disposableId)) {
      setView("costs");
      setError("Elige el desechable en cada renglón (o quita los renglones vacíos).");
      openSection("costing-disposables");
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
        proteinYieldPct: form.proteinYieldPct,
        disposables: form.disposables.map((line) => ({
          disposableId: line.disposableId,
          packPrice: Number(line.packPrice) || 0,
          piecesPerBowl: Number(line.piecesPerBowl) || 0,
          appliesTo: line.appliesTo,
        })),
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
  const parts = data.parts || {};
  const missingCosts = bowls.filter((b) => b.proteinSource === "falta");
  const zeroParts = [
    ...(!bowls[0]?.rows.base ? ["base"] : []),
    ...Object.entries(ROW_LABELS).filter(([key]) => !bowls[0]?.rows[key]).map(([, label]) => label.toLowerCase()),
  ];
  const incompleteComplements = (usage.keys || []).filter((key) =>
    (usage.frequency?.[key] || 0) > 0 && !(data.complementCosts?.[key]?.costPerPortion > 0)
  );
  // Cuántos de cada cosa lleva un bowl de verdad, para no capturar a ojo.
  const realAvg = usage.averagePerBowl || {};
  const ivaPct = Math.round((data.ivaRate ?? 0.16) * 100);
  const normalize = (value) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visibleComplements = (usage.keys || []).filter((key) => {
    const matches = normalize(usage.labels?.[key] || key).includes(normalize(search));
    const resolved = data.complementCosts?.[key] || {};
    const entry = form.complementCosts?.[key] || {};
    const inventoryCost = resolved.inventoryCostPerUnit ?? (resolved.source === "inventario" ? resolved.costPerUnit : 0);
    const missing = resolved.source !== "receta" && (
      !(Number(entry.costPerUnit) > 0 || inventoryCost > 0) || !(Number(entry.portionsPerUnit) > 0)
    );
    return matches && (!onlyMissing || missing);
  });

  // Mismo prorrateo de desechables que hace el servidor, para ver el costo al
  // capturar sin tener que guardar primero.
  const catalog = data.disposableCatalog || [];
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const hasUsage = usage.bowls > 0;
  const togoShare = hasUsage ? Number(usage.togoShare) || 0 : 1;
  const saucesPerBowl = hasUsage ? Number(realAvg.sauces) || 0 : Number(data.config.sauces?.unitsPerBowl) || 0;
  const disposableLine = (line) => {
    const item = catalogById.get(line.disposableId);
    const piecesPerPack = Number(item?.piecesPerPack) || Number(line.piecesPerPack) || 0;
    const piecePrice = piecesPerPack > 0 ? (Number(line.packPrice) || 0) / piecesPerPack : 0;
    const weight = line.appliesTo === "togo" ? togoShare : line.appliesTo === "per_sauce" ? saucesPerBowl : 1;
    return { item, piecesPerPack, piecePrice, perBowl: piecePrice * (Number(line.piecesPerBowl) || 0) * weight };
  };
  const disposablesTotal = form.disposables.reduce((sum, line) => sum + disposableLine(line).perBowl, 0);
  const takenDisposables = new Set(form.disposables.map((line) => line.disposableId).filter(Boolean));

  // ---- Qué tan exacto es el costo: lo que ya está y lo que falta ----
  const usedComplements = (usage.keys || []).filter((key) => (usage.frequency?.[key] || 0) > 0);
  const complementsWithCost = usedComplements.filter((key) => (data.complementCosts?.[key]?.costPerPortion || 0) > 0);
  const yieldsCaptured = bowls.filter((b) => data.config.proteinYieldPct?.[b.proteinKey] !== undefined);
  const recipesWithoutYield = Object.values(data.recipeStatus || {}).filter((r) => r.missingYield);
  const disposablesWithoutPrice = (parts.packaging?.detail || []).filter((line) => line.missingPrice);
  const recipeCheck = (key) => {
    const part = parts[key];
    const { label } = RECIPE_PART_LABELS[key];
    const hasCost = (bowls[0]?.rows?.[key] || 0) > 0;
    if (part?.source === "receta") return { status: "ok", label, detail: "Todo lo que se sirve tiene receta estándar." };
    if (part?.source === "mixto") {
      return { status: "partial", label, detail: `${Math.round(part.coveragePct)}% de lo que se sirve tiene receta; el resto usa el costo capturado.` };
    }
    return {
      status: hasCost ? "partial" : "missing",
      label,
      detail: hasCost
        ? key === "base"
          ? "Un solo costo capturado a mano para arroz, integral, quinoa y ensalada."
          : "Un solo costo capturado a mano, sin receta."
        : "Sin costo: hoy cuenta como $0.",
    };
  };
  const checks = [
    {
      status: missingCosts.length === 0 ? "ok" : "missing",
      label: "Costo por kg de cada proteína",
      detail: missingCosts.length === 0
        ? "Todas tienen costo."
        : `Faltan: ${missingCosts.map((b) => b.label).join(", ")}.`,
    },
    {
      status: bowls.length > 0 && yieldsCaptured.length === bowls.length ? "ok" : yieldsCaptured.length > 0 ? "partial" : "missing",
      label: "Merma de proteína (rendimiento)",
      detail: bowls.length > 0 && yieldsCaptured.length === bowls.length
        ? "Capturada en todas."
        : `Capturada en ${yieldsCaptured.length} de ${bowls.length}. Sin dato se cobra como si se aprovechara el 100% del kilo.`,
    },
    recipeCheck("base"),
    recipeCheck("marinades"),
    {
      status: usedComplements.length > 0 && complementsWithCost.length === usedComplements.length
        ? "ok" : complementsWithCost.length > 0 ? "partial" : "missing",
      label: "Complementos",
      detail: `${complementsWithCost.length} de ${usedComplements.length} complementos que sí se piden tienen costo por porción.`,
    },
    recipeCheck("sauces"),
    recipeCheck("toppings"),
    {
      status: parts.packaging?.source === "desglose"
        ? disposablesWithoutPrice.length > 0 ? "partial" : "ok"
        : (bowls[0]?.rows?.packaging || 0) > 0 ? "partial" : "missing",
      label: "Desechables",
      detail: parts.packaging?.source === "desglose"
        ? disposablesWithoutPrice.length > 0
          ? `Sin precio: ${disposablesWithoutPrice.map((line) => line.name).join(", ")}.`
          : `${parts.packaging.detail.length} desechables desglosados.`
        : (bowls[0]?.rows?.packaging || 0) > 0
          ? "Un solo monto general; desglósalo en Editar costos."
          : "Sin capturar: hoy cuentan como $0.",
    },
  ];
  if (recipesWithoutYield.length > 0) {
    checks.push({
      status: "partial",
      label: "Recetas sin rendimiento",
      detail: `${recipesWithoutYield.map((r) => r.name).join(", ")}: sin porciones por lote no entran al costo del bowl.`,
    });
  }
  const pendingChecks = checks.filter((c) => c.status !== "ok").length;

  return (
    <section className={styles?.portalSurface}>
      <div className={ui.page}>
        <header className={ui.header}>
          <h2 className={ui.title}>Costeo de bowls</h2>
          <p className={ui.subtitle}>Consulta el margen de tus bowls y actualiza costos y porciones en un solo lugar. Todos los importes están en MXN; el margen se mide contra el precio sin IVA ({ivaPct}%), que es lo que de verdad le queda al negocio.</p>
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
          <p className={ui.subtitle}>Cada opción supone un bowl con una sola proteína ({(bowls[0]?.proteinKg ?? 0.1) * 1000} g servidos). El margen es sin IVA y antes de renta, nómina y otros gastos.</p></div>
          <button type="button" className={ui.secondaryBtn} onClick={() => setView("costs")}>Actualizar costos →</button>
        </div>
        {dirty && <p className={ui.warnBox}>Tienes cambios pendientes. Este resumen muestra los últimos costos guardados.</p>}

        {/* ---- Qué tan exacto es el número ---- */}
        <details className={`${ui.disclosure} ${ui.checklist}`} open>
          <summary>
            ¿Qué tan exacto es este costo?
            <small>{pendingChecks === 0 ? "Completo" : `${pendingChecks} pendiente${pendingChecks === 1 ? "" : "s"}`}</small>
          </summary>
          <ul>
            {checks.map((check) => (
              <li key={check.label} className={CHECK_STYLE[check.status]}>
                <span className={ui.checkIcon} aria-hidden="true">{CHECK_ICON[check.status]}</span>
                <span>
                  <strong>{check.label}</strong>
                  <span className={ui.hint}>{check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>

        {bowls.length > 0 && zeroParts.length > 0 && <p className={ui.warnBox}>Costos en cero: {zeroParts.join(", ")}. Revisa si faltan datos; el margen puede parecer mayor al real.</p>}
        {incompleteComplements.length > 0 && <div className={ui.warnBox}>
          <p>Hay {incompleteComplements.length} complemento(s) con uso registrado sin costo por porción. Completa sus costos y rendimientos antes de tomar decisiones con estos márgenes.</p>
          <button type="button" className={ui.secondaryBtn} onClick={() => { setView("costs"); setOnlyMissing(true); setSearch(""); openSection("costing-complements"); }}>Revisar complementos pendientes →</button>
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
              <dl><div><dt>Costo estimado</dt><dd>{missing ? "Por completar" : money(b.total)}</dd></div>
              <div><dt>Precio de menú</dt><dd>{money(b.menuPrice)}</dd></div>
              <div><dt>Sin IVA</dt><dd>{money(b.price)}</dd></div>
              <div className={ui.cardMargin}><dt>Margen por bowl</dt><dd>{missing ? "—" : <>{money(b.margin)} <small>{pct(b.marginPct)}</small></>}</dd></div></dl>
              {/* Si la proteína ni siquiera entra al 2x1, eso se dice aunque falten complementos. */}
              <p className={`${ui.verdict} ${VERDICT_STYLE[missing || (incompleteComplements.length && b.verdict.status !== "excluida") ? "sin_datos" : b.verdict.status]}`}>{missing ? "Captura el costo de esta proteína para evaluar su margen." : b.verdict.status === "excluida" ? b.verdict.message : incompleteComplements.length ? "Estimación parcial: completa los costos de complementos para evaluar promociones." : b.verdict.message}</p>
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
                    <span className={ui.sold}>
                      {b.sold30d} registros / 30d{b.soldPromo30d > 0 && ` + ${b.soldPromo30d} en 2x1`}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={ui.stickyCol}>
                  Base <SourceBadge part={parts.base} />
                  {data.config.baseGramsPerPortion > 0 && parts.base?.source === "manual" && (
                    <span className={ui.hint}>{data.config.baseGramsPerPortion} g</span>
                  )}
                </td>
                {bowls.map((b) => <td key={b.proteinKey}>{money(b.rows.base)}</td>)}
              </tr>
              <tr>
                <td className={ui.stickyCol}>
                  Proteína <span className={ui.hint}>{(bowls[0]?.proteinKg ?? 0) * 1000} g servidos</span>
                </td>
                {bowls.map((b) => (
                  <td key={b.proteinKey}>
                    {b.proteinSource === "falta" ? "Sin costo" : money(b.rows.protein)}
                    {" "}
                    <span className={`${ui.badge} ${b.proteinSource === "inventario" ? ui.badgeAuto : ui.badgeManual}`}>
                      {b.proteinSource === "inventario" ? "auto" : b.proteinSource}
                    </span>
                    {b.proteinYieldPct < 100 && <span className={ui.sold}>rinde {b.proteinYieldPct}%</span>}
                  </td>
                ))}
              </tr>
              {Object.entries(ROW_LABELS).map(([key, label]) => (
                <tr key={key}>
                  <td className={ui.stickyCol}>{label} <SourceBadge part={parts[key]} /></td>
                  {bowls.map((b) => <td key={b.proteinKey}>{money(b.rows[key])}</td>)}
                </tr>
              ))}
              <tr className={ui.totalRow}>
                <td className={ui.stickyCol}>Costo total del bowl</td>
                {bowls.map((b) => <td key={b.proteinKey}>{b.proteinSource === "falta" ? "Incompleto" : money(b.total)}</td>)}
              </tr>
              <tr>
                <td className={ui.stickyCol}>Precio de menú <span className={ui.hint}>con IVA</span></td>
                {bowls.map((b) => <td key={b.proteinKey}>{money(b.menuPrice)}</td>)}
              </tr>
              <tr>
                <td className={ui.stickyCol}>Precio sin IVA <span className={ui.hint}>lo que le queda al negocio</span></td>
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
                <td className={ui.stickyCol}>
                  Costo de cada bowl del 2x1
                  <span className={ui.hint}>
                    {Math.round((bowls[0]?.scenarios.promo2x1.proteinKg ?? 0) * 1000)} g de proteína, máx. {PROMO_2X1_MAX_COMPLEMENTS} complementos, para comer aquí
                  </span>
                </td>
                {bowls.map((b) => (
                  <td key={b.proteinKey}>
                    {b.proteinSource === "falta" ? "—" : money(b.scenarios.promo2x1.total)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={ui.stickyCol}>
                  Margen en 2x1
                  <span className={ui.hint}>
                    {money(bowls[0]?.scenarios.promo2x1.menuPrice)} c/u · {money(bowls[0]?.scenarios.promo2x1.price)} sin IVA
                  </span>
                </td>
                {bowls.map((b) => {
                  const promo = b.scenarios.promo2x1;
                  const tone = !promo.eligible ? "" : promo.marginPct >= data.config.promoMinMarginPct ? ui.ok : ui.bad;
                  return (
                    <td key={b.proteinKey} className={tone}>
                      {b.proteinSource === "falta" ? "—" : <>{money(promo.margin)} <span className={ui.pctChip}>{pct(promo.marginPct)}</span></>}
                      {!promo.eligible && <span className={ui.sold}>no entra · solo referencia</span>}
                    </td>
                  );
                })}
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
              Usa {data.weighted.units} registros de proteínas de los últimos {data.salesMixWindowDays} días y los costos actuales
              {data.weighted.promoUnits > 0 && <> ({data.weighted.promoUnits} de bowls del 2x1, con su precio y costo de promo)</>}.
              Un bowl puede registrar varias proteínas; estos importes no son las ventas ni la utilidad contable del periodo.
            </p>
            <div className={ui.kpis}>
              <div className={ui.kpi}><span>Venta estimada sin IVA</span><strong>{money(data.weighted.revenue)}</strong></div>
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
            <p className={ui.subtitle}>Bowl ({data.combo.basedOn}) + bebida + rice cake, contra el precio de {money(data.combo.menuPrice)} ({money(data.combo.price)} sin IVA).</p>
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
            lo que costó el paquete ÷ cuántas porciones rinde. Marinados, salsas, toppings y base
            usan el costo de su receta estándar cuando ya la tienen.
          </p>

          <details className={ui.disclosure} open>
          <summary>1. Base y costos por bowl <small>Base, marinados, salsas y toppings</small></summary>
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
            <p className={ui.coverage}>{coverageText(parts.base, BASE_LABELS)}</p>
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
                {RECIPE_PART_LABELS[key] && (
                  <p className={ui.coverage}>{coverageText(parts[key], RECIPE_PART_LABELS[key].names)}</p>
                )}
              </div>
            ))}
          </div>
          <p className={ui.hint}>El costo general de complementos se usa como respaldo cuando no hay costos individuales disponibles.</p>

          </details>

          <details id="costing-disposables" className={ui.disclosure} open>
          <summary>2. Desechables <small>Contenedor, tapa, cubiertos, vasitos y bolsa</small></summary>
          <p className={ui.subtitle}>
            Todo lo que se va con el bowl. Pon el precio del paquete como lo compras; las piezas por
            paquete salen del catálogo de Inventario → Desechables.
            {hasUsage
              ? ` En los últimos ${usage.windowDays} días ${Math.round(togoShare * 100)}% de los bowls se fueron para llevar o por delivery, con ${saucesPerBowl} salsas por bowl en promedio.`
              : " Sin ventas todavía para saber cuántos son para llevar: se cuentan todos."}
          </p>
          {catalog.length === 0 ? (
            <p className={ui.warnBox}>
              Todavía no hay desechables dados de alta. Agrégalos en Inventario → Desechables
              (con cuántas piezas trae cada paquete) y regresa aquí a ponerles precio.
            </p>
          ) : (
            <>
              <div className={ui.dispList}>
                {form.disposables.map((line, index) => {
                  const { item, piecesPerPack, piecePrice, perBowl } = disposableLine(line);
                  return (
                    <div key={line.disposableId || `new-${index}`} className={ui.dispRow}>
                      <label className={ui.dispName}>
                        <span className={ui.hint}>Desechable</span>
                        <select
                          value={line.disposableId}
                          onChange={(e) => setDisposable(index, "disposableId", e.target.value)}
                        >
                          <option value="">— elige —</option>
                          {line.disposableId && !item && (
                            <option value={line.disposableId}>{line.name} (ya no está en el catálogo)</option>
                          )}
                          {catalog.map((option) => (
                            <option
                              key={option.id}
                              value={option.id}
                              disabled={option.id !== line.disposableId && takenDisposables.has(option.id)}
                            >
                              {option.name} · {option.piecesPerPack} pzas
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className={ui.hint}>Precio del paquete ($)</span>
                        <input
                          type="number" min="0" step="any" inputMode="decimal" placeholder="0"
                          value={line.packPrice}
                          onChange={(e) => setDisposable(index, "packPrice", e.target.value)}
                        />
                      </label>
                      <label>
                        <span className={ui.hint}>Piezas por bowl</span>
                        <input
                          type="number" min="0" max="20" step="any" inputMode="decimal"
                          value={line.piecesPerBowl}
                          onChange={(e) => setDisposable(index, "piecesPerBowl", e.target.value)}
                        />
                      </label>
                      <label>
                        <span className={ui.hint}>Se usa en</span>
                        <select
                          value={line.appliesTo}
                          onChange={(e) => setDisposable(index, "appliesTo", e.target.value)}
                        >
                          {APPLIES_TO.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <div className={ui.dispCost}>
                        <span className={ui.hint}>{piecesPerPack > 0 ? `${money(piecePrice)} c/u` : "—"}</span>
                        <strong>{money(perBowl)}</strong>
                      </div>
                      <button
                        type="button"
                        className={ui.removeBtn}
                        onClick={() => removeDisposable(index)}
                        aria-label={`Quitar ${item?.name || line.name || "desechable"}`}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
              <button type="button" className={ui.secondaryBtn} onClick={addDisposable}>
                + Agregar desechable
              </button>
            </>
          )}
          {form.disposables.length === 0 && (data.config.packaging?.costPerUnit || 0) > 0 && (
            <p className={ui.coverage}>
              Hoy se usa un monto general de empaque de {money(bowls[0]?.rows.packaging)} por bowl.
              En cuanto agregues desechables aquí, el desglose lo reemplaza.
            </p>
          )}
          <p className={`${ui.complementTotal} ${ui.spaced}`}>
            Desechables por bowl promedio:
            <strong>{money(form.disposables.length > 0 ? disposablesTotal : bowls[0]?.rows.packaging)}</strong>
          </p>
          </details>

          <details id="costing-complements" className={ui.disclosure} open>
          <summary>3. Complementos <small>Costo de compra y rendimiento</small></summary>
          <h4 className={ui.subhead}>
            Costo por complemento
            <span className={ui.hint}>
              Pon lo que te cuesta la unidad que compras (kilo, pieza o paquete) y cuántas
              porciones rinde — la app saca el costo por porción. El costo sale del inventario
              cuando ya está capturado ahí, y de la receta estándar si el complemento tiene una.
              Se pondera por qué tan seguido lo piden, según
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
              const fromRecipe = resolved.source === "receta";
              const inventoryCost = resolved.inventoryCostPerUnit ?? (resolved.source === "inventario" ? resolved.costPerUnit : 0);
              const costPerUnit = Number(entry.costPerUnit) || inventoryCost || 0;
              const portions = Number(entry.portionsPerUnit) || 0;
              const perPortion = fromRecipe
                ? resolved.costPerPortion
                : costPerUnit > 0 && portions > 0 ? costPerUnit / portions : 0;
              return (
                <div key={key} className={ui.complementCard} hidden={!visibleComplements.includes(key)}>
                  <div className={ui.complementHead}>
                    <span className={ui.complementLabel}>{label}</span>
                    <span className={ui.freq}>{Math.round(freq * 100)}% de los bowls</span>
                  </div>
                  {fromRecipe ? (
                    <p className={ui.coverage}>Usa el costo de su receta estándar (pestaña Recetas).</p>
                  ) : (
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
                  )}
                  <div className={ui.complementFoot}>
                    <span>{perPortion > 0 ? `${money(perPortion)} por porción` : "Falta costo o rendimiento"}</span>
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
          <summary>4. Proteínas <small>Costo por kilo y rendimiento</small></summary>
          <p className={ui.subtitle}>
            El costo del inventario se usa automáticamente. Un importe manual lo reemplaza; déjalo vacío
            para volver a usar el inventario. El rendimiento es qué porcentaje del kilo que compras termina
            servido, después de limpiar, quitar piel o sangre y porcionar: pesa el lomo antes y después una
            vez; si de 1 kg salen 850 g, pon 85. El tofu o el camarón ya cocido suelen ser 100.
          </p>
          <div className={ui.grid}>
            {bowls.map((b) => {
              const typedCost = Number(form.proteinCostPerKgOverride[b.proteinKey]) || b.proteinCostPerKg;
              const typedYield = Number(form.proteinYieldPct[b.proteinKey]) || 100;
              const usable = typedYield > 0 && typedYield <= 100 ? typedCost / (typedYield / 100) : typedCost;
              return (
                <div key={b.proteinKey} className={ui.field}>
                  <label>{b.label}</label>
                  <span className={ui.hint}>
                    {b.proteinSource === "inventario"
                      ? `Del inventario: ${money(b.proteinCostPerKg)}/kg — déjalo vacío para seguir usándolo`
                      : "Captura el costo por kg"}
                  </span>
                  <div className={ui.inputRow}>
                    <label><span className={ui.hint}>Costo por kg ($)</span>
                    <input
                      type="number" min="0" step="any" inputMode="decimal" aria-label={`Costo por kilo de ${b.label}`}
                      placeholder={b.proteinSource === "inventario" ? String(b.proteinCostPerKg) : "0"}
                      value={form.proteinCostPerKgOverride[b.proteinKey] ?? ""}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        proteinCostPerKgOverride: { ...prev.proteinCostPerKgOverride, [b.proteinKey]: e.target.value },
                      }))}
                    />
                    </label>
                    <label><span className={ui.hint}>Rendimiento (%)</span>
                    <input
                      type="number" min="20" max="100" step="any" inputMode="decimal" placeholder="100"
                      aria-label={`Rendimiento en porcentaje de ${b.label}`}
                      value={form.proteinYieldPct[b.proteinKey] ?? ""}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        proteinYieldPct: { ...prev.proteinYieldPct, [b.proteinKey]: e.target.value },
                      }))}
                    />
                    </label>
                  </div>
                  <span className={ui.hint}>Costo real servido: {money(usable)}/kg</span>
                </div>
              );
            })}
          </div>
          </details>
          <details className={ui.disclosure}>
          <summary>5. Combo y reglas de margen <small>Bebida, rice cake y objetivos</small></summary>

          <div className={ui.grid}>
            {[
              ["comboDrinkCost", "Costo de la bebida del combo", "Importe por bebida"],
              ["comboRiceCakeCost", "Costo del rice cake", "Importe por pieza"],
              ["promoMinMarginPct", "Margen mínimo con promoción (%)", "Por debajo de este porcentaje (sin IVA), la promoción no alcanza tu objetivo"],
              ["promoEligibleMinMarginPct", "Margen mínimo para entrar al 2x1 (%)", "Margen sin promoción (sin IVA) que debe tener la proteína"],
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
