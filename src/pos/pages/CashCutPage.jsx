import { useState, useEffect, useContext, useCallback, useMemo } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import ui from "./CashCutPage.module.css";

const fmtMXN = (n) => `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function CashCutPage({ styles }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);

  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [notice, setNotice]   = useState("");
  const [showGuide, setShowGuide] = useState(true);

  const [openingFloat, setOpeningFloat] = useState("");
  const [countedCash, setCountedCash]   = useState("");
  const [notes, setNotes]               = useState("");
  const [saving, setSaving]             = useState(false);
  const [formError, setFormError]       = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/staff/cash-cuts/preview"),
      api.get("/api/staff/cash-cuts"),
    ])
      .then(([p, h]) => {
        setPreview(p);
        setHistory(h.cashCuts ?? []);
        setOpeningFloat((prev) => (prev === "" ? String(p.suggestedOpeningFloat ?? 0) : prev));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const numOpening = parseFloat(openingFloat);
  const numCounted = parseFloat(countedCash);
  const validOpening = Number.isFinite(numOpening) && numOpening >= 0;
  const validCounted = Number.isFinite(numCounted) && numCounted >= 0;

  const expectedCash = useMemo(() => {
    if (!preview || !validOpening) return null;
    return Math.round((numOpening + preview.cashSales) * 100) / 100;
  }, [preview, numOpening, validOpening]);

  const difference = useMemo(() => {
    if (expectedCash == null || !validCounted) return null;
    return Math.round((numCounted - expectedCash) * 100) / 100;
  }, [expectedCash, numCounted, validCounted]);

  const resetForm = () => {
    setCountedCash("");
    setNotes("");
    setFormError("");
    setConfirmSubmit(false);
  };

  const handleSubmit = async () => {
    if (!validOpening) return setFormError("Ingresa un fondo inicial válido.");
    if (!validCounted) return setFormError("Ingresa el efectivo contado.");
    if (!confirmSubmit) { setConfirmSubmit(true); return; }

    setFormError(""); setSaving(true);
    try {
      const { cashCut } = await api.post("/api/staff/cash-cuts", {
        openingFloat: numOpening,
        countedCash: numCounted,
        notes,
      });
      setHistory((prev) => [cashCut, ...prev]);
      setNotice(
        cashCut.difference === 0
          ? "Corte registrado — la caja cuadró exacto."
          : cashCut.difference > 0
          ? `Corte registrado — sobrante de ${fmtMXN(cashCut.difference)}.`
          : `Corte registrado — faltante de ${fmtMXN(Math.abs(cashCut.difference))}.`
      );
      resetForm();
      load(); // refresca el preview: el siguiente corte arranca donde terminó este
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className={ui.root}>
      <div className={`${styles.pageHeader} ${ui.pageHeader}`}>
        <div>
          <h1 className={styles.pageTitle}>Corte de caja</h1>
          <p className={styles.pageSubtitle}>Cuenta el efectivo físico y compáralo contra lo que vendió el sistema.</p>
        </div>
        <div className={ui.headerActions}>
          <button className={styles.btnGhost} onClick={() => setShowGuide((v) => !v)}>? Cómo funciona</button>
          <button className={styles.btnGhost} onClick={load} title="Volver a cargar los datos">↻ Actualizar</button>
        </div>
      </div>

      {showGuide && (
        <section className={ui.guide} aria-label="Guía rápida de corte de caja">
          <div className={ui.guideIntro}>
            <span className={ui.guideEyebrow}>Guía rápida</span>
            <strong>Cómo cuadra tu caja</strong>
            <button type="button" onClick={() => setShowGuide(false)} aria-label="Ocultar guía">×</button>
          </div>
          <div className={ui.guideSteps}>
            <div className={ui.guideStep}><span>1</span><p><strong>Fondo inicial</strong>El efectivo con el que arrancó la caja (normalmente siempre el mismo monto).</p></div>
            <div className={ui.guideStep}><span>2</span><p><strong>Cuenta el efectivo</strong>Suma todo lo que hay físicamente en la caja ahora.</p></div>
            <div className={ui.guideStep}><span>3</span><p><strong>Compara</strong>El sistema ya sabe cuánto se vendió en efectivo — si no cuadra, verás el faltante o sobrante.</p></div>
          </div>
        </section>
      )}

      {notice && (
        <div className={ui.successNotice} role="status">
          <span>✓</span>{notice}
          <button type="button" onClick={() => setNotice("")} aria-label="Cerrar notificación">×</button>
        </div>
      )}

      {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div className={`${styles.card} ${ui.formCard}`}>
        <p className={styles.cardTitle}>Registrar corte</p>
        <p className={ui.periodLine}>
          Periodo a cerrar: <strong>{loading ? "—" : fmtTime(preview?.from)}</strong> → <strong>ahora</strong>
          {preview?.lastCutAt == null && !loading && <span className={ui.firstCutBadge}>primer corte de hoy</span>}
        </p>

        {formError && <p style={{ color: "red", fontSize: 12, marginBottom: 12 }}>{formError}</p>}

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Fondo inicial (MXN) *</label>
            <input className={styles.input} type="number" min="0" step="0.01" placeholder="0.00"
              value={openingFloat}
              onChange={(e) => { setOpeningFloat(e.target.value); setConfirmSubmit(false); }}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Ventas en efectivo (sistema)</label>
            <input className={styles.input} value={loading ? "Calculando…" : fmtMXN(preview?.cashSales)} disabled />
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Efectivo contado (MXN) *</label>
          <input className={styles.input} type="number" min="0" step="0.01" placeholder="0.00"
            value={countedCash}
            onChange={(e) => { setCountedCash(e.target.value); setConfirmSubmit(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Notas (opcional)</label>
          <input className={styles.input} placeholder="Ej: faltaron monedas para cambio, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {expectedCash != null && (
          <div className={ui.expectedRow}>
            <span>Efectivo esperado</span>
            <strong>{fmtMXN(expectedCash)}</strong>
          </div>
        )}

        {difference != null && (
          <div className={`${ui.differenceRow} ${difference === 0 ? ui.diffOk : difference > 0 ? ui.diffOver : ui.diffShort}`}>
            <span>{difference === 0 ? "Cuadra exacto" : difference > 0 ? "Sobrante" : "Faltante"}</span>
            <strong>{difference === 0 ? fmtMXN(0) : fmtMXN(Math.abs(difference))}</strong>
          </div>
        )}

        <div className={ui.formActions}>
          <button className={styles.btnPrimary} onClick={handleSubmit} disabled={saving || loading} type="button">
            {saving ? "Guardando…" : confirmSubmit ? "Confirmar y registrar" : "Registrar corte"}
          </button>
          {confirmSubmit && (
            <button className={styles.btnGhost} type="button" onClick={() => setConfirmSubmit(false)}>Cancelar</button>
          )}
        </div>
      </div>

      <section className={ui.listHeading}>
        <div>
          <h2>Historial de cortes</h2>
          <p>{history.length} corte{history.length !== 1 ? "s" : ""} registrado{history.length !== 1 ? "s" : ""}</p>
        </div>
      </section>

      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${ui.cutsTable}`}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Empleado</th>
              <th>Esperado</th>
              <th>Contado</th>
              <th>Diferencia</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className={ui.loadingCell}>Cargando historial…</td></tr>
            ) : history.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className={ui.emptyState}>
                    <span>$</span>
                    <strong>Todavía no hay cortes registrados</strong>
                    <p>Registra el primero arriba cuando cierres la caja.</p>
                  </div>
                </td>
              </tr>
            ) : history.map((c) => (
              <tr key={c._id}>
                <td className={styles.tdMuted}>{fmtTime(c.to)}</td>
                <td>{c.employeeName}</td>
                <td className={styles.tdMono}>{fmtMXN(c.expectedCash)}</td>
                <td className={styles.tdMono}>{fmtMXN(c.countedCash)}</td>
                <td>
                  <span className={`${styles.badge} ${c.difference === 0 ? ui.badgeOk : c.difference > 0 ? ui.badgeOver : ui.badgeShort}`}>
                    {c.difference === 0 ? "Exacto" : c.difference > 0 ? `+${fmtMXN(c.difference)}` : `−${fmtMXN(Math.abs(c.difference))}`}
                  </span>
                </td>
                <td className={styles.tdMuted}>{c.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
