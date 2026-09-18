import { useState, useEffect, useContext, useCallback } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import ui from "./CostingPage.module.css";

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const pct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

// Las partes del bowl que se capturan a mano: el inventario todavía no sabe
// cuántas porciones rinde un paquete, así que esto se define una vez aquí.
const PARTS = [
  { key: "base", label: "Base", hint: "Arroz, quinoa o ensalada — costo de 1 porción" },
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

  const hydrate = useCallback((report) => {
    setData(report);
    setForm({
      ...Object.fromEntries(PARTS.map(({ key }) => [key, {
        costPerUnit: String(report.config[key]?.costPerUnit ?? 0),
        unitsPerBowl: String(report.config[key]?.unitsPerBowl ?? 0),
      }])),
      comboDrinkCost: String(report.config.comboDrinkCost ?? 0),
      comboRiceCakeCost: String(report.config.comboRiceCakeCost ?? 0),
      promoMinMarginPct: String(report.config.promoMinMarginPct ?? 25),
      promoEligibleMinMarginPct: String(report.config.promoEligibleMinMarginPct ?? 40),
      proteinCostPerKgOverride: Object.fromEntries(
        (report.bowls || []).map((b) => [
          b.proteinKey,
          String(report.config.proteinCostPerKgOverride?.[b.proteinKey] ?? ""),
        ])
      ),
    });
  }, []);

  useEffect(() => {
    let alive = true;
    api.get("/api/staff/costing")
      .then((report) => { if (alive) hydrate(report); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPart = (partKey, field, value) =>
    setForm((prev) => ({ ...prev, [partKey]: { ...prev[partKey], [field]: value } }));

  const save = async () => {
    setSaving(true);
    setError("");
    setSavedMsg("");
    try {
      const payload = {
        ...Object.fromEntries(PARTS.map(({ key }) => [key, {
          costPerUnit: Number(form[key].costPerUnit) || 0,
          unitsPerBowl: Number(form[key].unitsPerBowl) || 0,
        }])),
        comboDrinkCost: Number(form.comboDrinkCost) || 0,
        comboRiceCakeCost: Number(form.comboRiceCakeCost) || 0,
        promoMinMarginPct: Number(form.promoMinMarginPct) || 0,
        promoEligibleMinMarginPct: Number(form.promoEligibleMinMarginPct) || 0,
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
  if (!data || !form) return <p className={ui.error}>{error || "No se pudo cargar el costeo."}</p>;

  const bowls = data.bowls || [];
  const missingCosts = bowls.filter((b) => b.proteinSource === "falta");

  return (
    <section className={styles?.portalSurface}>
      <div className={ui.page}>
        <header className={ui.header}>
          <h2 className={ui.title}>Costeo de bowls</h2>
          <p className={ui.subtitle}>
            Cuánto cuesta producir cada bowl y cuánto margen deja. El costo de la proteína
            se lee solo del inventario; el resto se captura aquí una vez.
          </p>
        </header>

        {error && <p className={ui.error}>{error}</p>}
        {savedMsg && <p className={ui.success}>{savedMsg}</p>}

        {missingCosts.length > 0 && (
          <div className={ui.warnBox}>
            <strong>Faltan costos de proteína:</strong>
            <ul>
              {missingCosts.map((b) => (
                <li key={b.proteinKey}>{b.label} — {b.proteinNote}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ---- Tabla principal: la del documento de estrategia ---- */}
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th className={ui.stickyCol}>Concepto</th>
                {bowls.map((b) => (
                  <th key={b.proteinKey}>
                    {b.label}
                    <span className={ui.sold}>{b.sold30d} vendidos / 30d</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={ui.stickyCol}>Base</td>
                {bowls.map((b) => <td key={b.proteinKey}>{money(b.rows.base)}</td>)}
              </tr>
              <tr>
                <td className={ui.stickyCol}>
                  Proteína <span className={ui.hint}>{(bowls[0]?.proteinKg ?? 0) * 1000} g</span>
                </td>
                {bowls.map((b) => (
                  <td key={b.proteinKey}>
                    {money(b.rows.protein)}
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
                {bowls.map((b) => <td key={b.proteinKey}>{money(b.total)}</td>)}
              </tr>
              <tr>
                <td className={ui.stickyCol}>Precio de venta</td>
                {bowls.map((b) => <td key={b.proteinKey}>{money(b.price)}</td>)}
              </tr>
              <tr className={ui.marginRow}>
                <td className={ui.stickyCol}>Margen $ / %</td>
                {bowls.map((b) => (
                  <td key={b.proteinKey} className={b.marginPct >= 40 ? ui.good : b.marginPct >= 25 ? ui.ok : ui.bad}>
                    {money(b.margin)} <span className={ui.pctChip}>{pct(b.marginPct)}</span>
                  </td>
                ))}
              </tr>
              <tr>
                <td className={ui.stickyCol}>Costo de producto (food cost)</td>
                {bowls.map((b) => <td key={b.proteinKey}>{pct(b.foodCostPct)}</td>)}
              </tr>
              <tr>
                <td className={ui.stickyCol}>Margen en 2x1 <span className={ui.hint}>$125 c/u</span></td>
                {bowls.map((b) => (
                  <td key={b.proteinKey} className={b.scenarios.promo2x1.marginPct >= 25 ? ui.ok : ui.bad}>
                    {money(b.scenarios.promo2x1.margin)} <span className={ui.pctChip}>{pct(b.scenarios.promo2x1.marginPct)}</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* ---- Reglas de decisión ---- */}
        <div className={ui.verdicts}>
          {bowls.map((b) => (
            <div key={b.proteinKey} className={`${ui.verdict} ${VERDICT_STYLE[b.verdict.status]}`}>
              <strong>{b.label}</strong>
              <span>{b.verdict.message}</span>
            </div>
          ))}
        </div>

        {/* ---- Margen real ponderado ---- */}
        {data.weighted && (
          <div className={ui.weighted}>
            <h3 className={ui.sectionTitle}>Margen real de los últimos {data.salesMixWindowDays} días</h3>
            <p className={ui.subtitle}>
              Ponderado por lo que de verdad se vendió ({data.weighted.units} bowls), no por un promedio teórico.
            </p>
            <div className={ui.kpis}>
              <div className={ui.kpi}><span>Venta</span><strong>{money(data.weighted.revenue)}</strong></div>
              <div className={ui.kpi}><span>Costo de producto</span><strong>{money(data.weighted.cost)}</strong></div>
              <div className={ui.kpi}><span>Margen</span><strong>{money(data.weighted.margin)}</strong></div>
              <div className={ui.kpi}><span>Margen %</span><strong>{pct(data.weighted.marginPct)}</strong></div>
              <div className={ui.kpi}><span>Food cost %</span><strong>{pct(data.weighted.foodCostPct)}</strong></div>
            </div>
          </div>
        )}

        {/* ---- Combo Palace ---- */}
        {data.combo && (
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

        {/* ---- Captura ---- */}
        <div className={ui.editor}>
          <h3 className={ui.sectionTitle}>Costos capturados</h3>
          <p className={ui.subtitle}>
            Cuánto cuesta cada parte y cuántas van en un bowl. Para sacar el costo por porción:
            lo que costó el paquete ÷ cuántas porciones rinde.
          </p>

          <div className={ui.grid}>
            {PARTS.map(({ key, label, hint }) => (
              <div key={key} className={ui.field}>
                <label>{label}</label>
                <span className={ui.hint}>{hint}</span>
                <div className={ui.inputRow}>
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal"
                    value={form[key].costPerUnit}
                    onChange={(e) => setPart(key, "costPerUnit", e.target.value)}
                    aria-label={`Costo por unidad de ${label}`}
                  />
                  <span className={ui.times}>×</span>
                  <input
                    type="number" min="0" step="0.5" inputMode="decimal"
                    value={form[key].unitsPerBowl}
                    onChange={(e) => setPart(key, "unitsPerBowl", e.target.value)}
                    aria-label={`Unidades por bowl de ${label}`}
                  />
                  <span className={ui.subtotal}>
                    = {money((Number(form[key].costPerUnit) || 0) * (Number(form[key].unitsPerBowl) || 0))}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <h4 className={ui.subhead}>Proteínas sin costo en el inventario ($ por kg)</h4>
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
                  type="number" min="0" step="1" inputMode="decimal"
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

          <h4 className={ui.subhead}>Combo y reglas</h4>
          <div className={ui.grid}>
            <div className={ui.field}>
              <label>Costo de la bebida del combo</label>
              <input type="number" min="0" step="0.5" inputMode="decimal"
                value={form.comboDrinkCost}
                onChange={(e) => setForm((p) => ({ ...p, comboDrinkCost: e.target.value }))} />
            </div>
            <div className={ui.field}>
              <label>Costo del rice cake</label>
              <input type="number" min="0" step="0.5" inputMode="decimal"
                value={form.comboRiceCakeCost}
                onChange={(e) => setForm((p) => ({ ...p, comboRiceCakeCost: e.target.value }))} />
            </div>
            <div className={ui.field}>
              <label>Margen mínimo con promoción</label>
              <span className={ui.hint}>Abajo de esto, la promo no se sostiene</span>
              <input type="number" min="0" max="100" step="1" inputMode="decimal"
                value={form.promoMinMarginPct}
                onChange={(e) => setForm((p) => ({ ...p, promoMinMarginPct: e.target.value }))} />
            </div>
            <div className={ui.field}>
              <label>Margen mínimo para entrar al 2x1</label>
              <span className={ui.hint}>Margen sin promo que debe tener la proteína</span>
              <input type="number" min="0" max="100" step="1" inputMode="decimal"
                value={form.promoEligibleMinMarginPct}
                onChange={(e) => setForm((p) => ({ ...p, promoEligibleMinMarginPct: e.target.value }))} />
            </div>
          </div>

          <button className={ui.saveBtn} onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar costos"}
          </button>
          {data.config.updatedAt && (
            <p className={ui.muted}>
              Última actualización: {new Date(data.config.updatedAt).toLocaleString("es-MX")}
              {data.config.updatedBy ? ` · ${data.config.updatedBy}` : ""}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
