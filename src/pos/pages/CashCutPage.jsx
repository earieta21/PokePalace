import { useState, useEffect, useContext, useCallback, useMemo } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import { downloadCSV } from "../../utils/csv";
import { tijuanaDateKey } from "../../utils/date";
import ui from "./CashCutPage.module.css";

const fmtMXN = (n) => n == null ? "—" : `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const diffClass = (n) => n == null ? "" : n === 0 ? ui.diffOk : n > 0 ? ui.diffOver : ui.diffShort;
const diffLabel = (n) => n == null ? "—" : n === 0 ? "Exacto" : n > 0 ? `+${fmtMXN(n)}` : `−${fmtMXN(Math.abs(n))}`;

export default function CashCutPage({ styles, role }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = createStaffApi(staffToken);
  const canReopen = role === "admin" || role === "owner";

  const [today, setToday] = useState(null); // { cashCut, date, salesSoFar }
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [notice, setNotice]   = useState("");
  const [showGuide, setShowGuide] = useState(true);

  const [openingFloat, setOpeningFloat] = useState("");
  const [draft, setDraft] = useState({ withdrawals: "", returns: "", commissions: "", cardTerminalTotal: "", onlineTotalReported: "", notes: "" });
  const [countedCash, setCountedCash] = useState("");
  const [differenceExplanation, setDifferenceExplanation] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [showReopen, setShowReopen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get("/api/staff/cash-cuts/today"),
      api.get("/api/staff/cash-cuts"),
    ])
      .then(([t, h]) => {
        setToday(t);
        setHistory(h.cashCuts ?? []);
        if (t.cashCut && t.cashCut.status === "open") {
          setDraft({
            withdrawals: String(t.cashCut.withdrawals ?? 0),
            returns: String(t.cashCut.returns ?? 0),
            commissions: String(t.cashCut.commissions ?? 0),
            cardTerminalTotal: t.cashCut.cardTerminalTotal != null ? String(t.cashCut.cardTerminalTotal) : "",
            onlineTotalReported: t.cashCut.onlineTotalReported != null ? String(t.cashCut.onlineTotalReported) : "",
            notes: t.cashCut.notes || "",
          });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [staffToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const cashCut = today?.cashCut || null;
  const isOpen = cashCut?.status === "open";
  const isClosed = cashCut?.status === "closed";

  const numOpening = parseFloat(openingFloat);
  const validOpening = Number.isFinite(numOpening) && numOpening >= 0;

  const handleOpen = async () => {
    if (!validOpening) return setFormError("Ingresa un fondo inicial válido.");
    setFormError(""); setSaving(true);
    try {
      const { cashCut: created } = await api.post("/api/staff/cash-cuts", { openingFloat: numOpening });
      setNotice("Cierre del día abierto.");
      setOpeningFloat("");
      setToday((prev) => ({ ...prev, cashCut: created }));
      load();
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  };

  const handleSaveDraft = async () => {
    if (!cashCut) return;
    setFormError(""); setSaving(true);
    try {
      const body = {
        withdrawals: draft.withdrawals || 0,
        returns: draft.returns || 0,
        commissions: draft.commissions || 0,
        notes: draft.notes,
      };
      if (draft.cardTerminalTotal !== "") body.cardTerminalTotal = draft.cardTerminalTotal;
      if (draft.onlineTotalReported !== "") body.onlineTotalReported = draft.onlineTotalReported;
      const { cashCut: updated } = await api.patch(`/api/staff/cash-cuts/${cashCut._id}`, body);
      setToday((prev) => ({ ...prev, cashCut: updated }));
      setNotice("Datos guardados.");
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  };

  const numCounted = parseFloat(countedCash);
  const validCounted = Number.isFinite(numCounted) && numCounted >= 0;

  const handleClose = async () => {
    if (!validCounted) return setFormError("Ingresa el efectivo contado.");
    if (!confirmClose) { setConfirmClose(true); return; }
    setFormError(""); setSaving(true);
    try {
      const { cashCut: closed } = await api.patch(`/api/staff/cash-cuts/${cashCut._id}/close`, {
        countedCash: numCounted,
        differenceExplanation,
      });
      setNotice(
        closed.difference === 0
          ? "Cierre completado — la caja cuadró exacto."
          : closed.difference > 0
          ? `Cierre completado — sobrante de ${fmtMXN(closed.difference)}.`
          : `Cierre completado — faltante de ${fmtMXN(Math.abs(closed.difference))}.`
      );
      setCountedCash(""); setDifferenceExplanation(""); setConfirmClose(false);
      load();
    } catch (e) {
      if (e.status === 400 && /supera el 1%/.test(e.message)) {
        setFormError(e.message); // deja visible el campo de explicación
      } else {
        setFormError(e.message);
      }
      setConfirmClose(false);
    }
    finally { setSaving(false); }
  };

  const handleReopen = async () => {
    if (!reopenReason.trim()) return setFormError("Escribe el motivo de la reapertura.");
    setFormError(""); setSaving(true);
    try {
      await api.patch(`/api/staff/cash-cuts/${cashCut._id}/reopen`, { reason: reopenReason });
      setNotice("Cierre reabierto.");
      setReopenReason(""); setShowReopen(false);
      load();
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  };

  const percentPreview = useMemo(() => {
    if (!cashCut || !validCounted) return null;
    const expected = cashCut.openingFloat + (today?.salesSoFar?.cash ?? 0) - (parseFloat(draft.returns) || 0) - (parseFloat(draft.withdrawals) || 0);
    const diff = numCounted - expected;
    const cashSoFar = today?.salesSoFar?.cash ?? 0;
    return { expected, diff, pct: (Math.abs(diff) / Math.max(cashSoFar, 1)) * 100 };
  }, [cashCut, validCounted, numCounted, draft, today]);

  const exportCSV = () => {
    const rows = [
      ["Fecha", "Sucursal", "Empleado", "Estado", "Fondo inicial", "Ventas efectivo", "Retiros", "Devoluciones", "Efectivo esperado", "Efectivo contado", "Diferencia efectivo", "% diferencia", "Ventas tarjeta", "Terminal", "Diferencia tarjeta", "Ventas en línea", "Depositado en línea", "Diferencia en línea", "Comisiones", "Notas"],
      ...history.map((c) => [
        c.date || tijuanaDateKey(c.createdAt), c.locationId, c.employeeName, c.status || "corte de turno",
        c.openingFloat, c.cashSales, c.withdrawals ?? 0, c.returns ?? 0, c.expectedCash, c.countedCash,
        c.difference, c.percentDifference ?? "", c.cardSalesExpected ?? "", c.cardTerminalTotal ?? "", c.cardDifference ?? "",
        c.onlineSalesExpected ?? "", c.onlineTotalReported ?? "", c.onlineDifference ?? "", c.commissions ?? 0, c.notes || "",
      ]),
    ];
    downloadCSV(`cierres_de_caja_${tijuanaDateKey()}.csv`, rows);
  };

  return (
    <div className={ui.root}>
      <div className={`${styles.pageHeader} ${ui.pageHeader}`}>
        <div>
          <h1 className={styles.pageTitle}>Cierre y arqueo de caja</h1>
          <p className={styles.pageSubtitle}>Un cierre por día — efectivo, tarjeta y pagos en línea contra lo que registró el sistema.</p>
        </div>
        <div className={ui.headerActions}>
          <button className={styles.btnGhost} onClick={() => setShowGuide((v) => !v)}>? Cómo funciona</button>
          <button className={styles.btnGhost} onClick={load} title="Volver a cargar los datos">↻ Actualizar</button>
          <button className={styles.btnGhost} onClick={exportCSV} disabled={history.length === 0}>↓ Exportar CSV</button>
        </div>
      </div>

      {showGuide && (
        <section className={ui.guide} aria-label="Guía rápida de cierre de caja">
          <div className={ui.guideIntro}>
            <span className={ui.guideEyebrow}>Guía rápida</span>
            <strong>Cómo cuadra tu caja</strong>
            <button type="button" onClick={() => setShowGuide(false)} aria-label="Ocultar guía">×</button>
          </div>
          <div className={ui.guideSteps}>
            <div className={ui.guideStep}><span>1</span><p><strong>Abre el día</strong>Captura el fondo inicial al empezar.</p></div>
            <div className={ui.guideStep}><span>2</span><p><strong>Captura durante el día</strong>Retiros, devoluciones, terminal y en línea.</p></div>
            <div className={ui.guideStep}><span>3</span><p><strong>Cierra</strong>Cuenta el efectivo y compáralo — si la diferencia pasa de 1%, pide que expliques por qué.</p></div>
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

      {!loading && !cashCut && (
        <div className={`${styles.card} ${ui.formCard}`}>
          <p className={styles.cardTitle}>Abrir el cierre de hoy</p>
          {formError && <p style={{ color: "red", fontSize: 12, marginBottom: 12 }}>{formError}</p>}
          <div className={styles.formGroup}>
            <label className={styles.label}>Fondo inicial (MXN) *</label>
            <input className={styles.input} type="number" min="0" step="0.01" placeholder="0.00"
              value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleOpen()}
            />
          </div>
          <div className={ui.formActions}>
            <button className={styles.btnPrimary} onClick={handleOpen} disabled={saving} type="button">
              {saving ? "Abriendo…" : "Abrir cierre de hoy"}
            </button>
          </div>
        </div>
      )}

      {!loading && isOpen && (
        <div className={`${styles.card} ${ui.formCard}`}>
          <p className={styles.cardTitle}>Cierre en curso — {today?.date}</p>
          {formError && <p style={{ color: "red", fontSize: 12, marginBottom: 12 }}>{formError}</p>}

          <div className={ui.expectedRow}>
            <span>Ventas en efectivo hasta ahora (sistema)</span>
            <strong>{fmtMXN(today?.salesSoFar?.cash)}</strong>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Retiros de caja</label>
              <input className={styles.input} type="number" min="0" step="0.01" placeholder="0.00"
                value={draft.withdrawals} onChange={(e) => setDraft((d) => ({ ...d, withdrawals: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Devoluciones (efectivo)</label>
              <input className={styles.input} type="number" min="0" step="0.01" placeholder="0.00"
                value={draft.returns} onChange={(e) => setDraft((d) => ({ ...d, returns: e.target.value }))} />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Total reportado por la terminal</label>
              <input className={styles.input} type="number" min="0" step="0.01" placeholder="0.00"
                value={draft.cardTerminalTotal} onChange={(e) => setDraft((d) => ({ ...d, cardTerminalTotal: e.target.value }))} />
              <small style={{ color: "var(--p-muted)", fontSize: 10.5 }}>Ventas con tarjeta del sistema: {fmtMXN(today?.salesSoFar?.card)}</small>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Total depositado/reportado en línea</label>
              <input className={styles.input} type="number" min="0" step="0.01" placeholder="0.00"
                value={draft.onlineTotalReported} onChange={(e) => setDraft((d) => ({ ...d, onlineTotalReported: e.target.value }))} />
              <small style={{ color: "var(--p-muted)", fontSize: 10.5 }}>Ventas en línea del sistema: {fmtMXN(today?.salesSoFar?.online)}</small>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Comisiones estimadas</label>
            <input className={styles.input} type="number" min="0" step="0.01" placeholder="0.00"
              value={draft.commissions} onChange={(e) => setDraft((d) => ({ ...d, commissions: e.target.value }))} />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Observaciones</label>
            <input className={styles.input} placeholder="Notas del día…"
              value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
          </div>

          <div className={ui.formActions}>
            <button className={styles.btnGhost} onClick={handleSaveDraft} disabled={saving} type="button">
              Guardar datos
            </button>
          </div>

          <hr style={{ margin: "18px 0", border: "none", borderTop: "1px solid var(--p-border)" }} />

          <p className={styles.cardTitle}>Cerrar el día</p>
          <div className={styles.formGroup}>
            <label className={styles.label}>Efectivo contado (MXN) *</label>
            <input className={styles.input} type="number" min="0" step="0.01" placeholder="0.00"
              value={countedCash}
              onChange={(e) => { setCountedCash(e.target.value); setConfirmClose(false); }}
            />
          </div>

          {percentPreview && percentPreview.pct > 1 && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Explica la diferencia (obligatorio, pasa de 1%) *</label>
              <input className={styles.input} placeholder="¿Qué pasó con el efectivo?"
                value={differenceExplanation} onChange={(e) => setDifferenceExplanation(e.target.value)} />
            </div>
          )}

          {percentPreview && (
            <div className={`${ui.differenceRow} ${diffClass(percentPreview.diff)}`}>
              <span>Diferencia estimada ({percentPreview.pct.toFixed(2)}%)</span>
              <strong>{diffLabel(percentPreview.diff)}</strong>
            </div>
          )}

          <div className={ui.formActions}>
            <button className={styles.btnPrimary} onClick={handleClose} disabled={saving} type="button">
              {saving ? "Cerrando…" : confirmClose ? "Confirmar cierre" : "Cerrar el día"}
            </button>
            {confirmClose && (
              <button className={styles.btnGhost} type="button" onClick={() => setConfirmClose(false)}>Cancelar</button>
            )}
          </div>
        </div>
      )}

      {!loading && isClosed && (
        <div className={`${styles.card} ${ui.formCard}`}>
          <p className={styles.cardTitle}>Cierre de hoy — completado</p>
          {formError && <p style={{ color: "red", fontSize: 12, marginBottom: 12 }}>{formError}</p>}

          <div className={ui.expectedRow}>
            <span>Efectivo esperado</span>
            <strong>{fmtMXN(cashCut.expectedCash)}</strong>
          </div>
          <div className={`${ui.differenceRow} ${diffClass(cashCut.difference)}`}>
            <span>Diferencia de efectivo ({(cashCut.percentDifference ?? 0).toFixed(2)}%)</span>
            <strong>{diffLabel(cashCut.difference)}</strong>
          </div>
          {cashCut.differenceExplanation && (
            <p style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 8 }}>
              <strong>Motivo:</strong> {cashCut.differenceExplanation}
            </p>
          )}

          {canReopen && (
            <div className={ui.formActions}>
              {!showReopen ? (
                <button className={styles.btnGhost} type="button" onClick={() => setShowReopen(true)}>
                  Reabrir cierre
                </button>
              ) : (
                <>
                  <input className={styles.input} placeholder="Motivo de la reapertura *"
                    value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} style={{ maxWidth: 320 }} />
                  <button className={styles.btnPrimary} onClick={handleReopen} disabled={saving} type="button">
                    Confirmar reapertura
                  </button>
                  <button className={styles.btnGhost} type="button" onClick={() => setShowReopen(false)}>Cancelar</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <section className={ui.listHeading}>
        <div>
          <h2>Historial de cierres</h2>
          <p>{history.length} registro{history.length !== 1 ? "s" : ""}</p>
        </div>
      </section>

      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${ui.cutsTable}`}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Empleado</th>
              <th>Estado</th>
              <th>Dif. efectivo</th>
              <th>Dif. tarjeta</th>
              <th>Dif. en línea</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className={ui.loadingCell}>Cargando historial…</td></tr>
            ) : history.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className={ui.emptyState}>
                    <span>$</span>
                    <strong>Todavía no hay cierres registrados</strong>
                    <p>Abre el cierre de hoy arriba para empezar.</p>
                  </div>
                </td>
              </tr>
            ) : history.map((c) => (
              <tr key={c._id}>
                <td className={styles.tdMuted}>{c.date || fmtDateTime(c.createdAt)}</td>
                <td>{c.employeeName}</td>
                <td>
                  <span className={`${styles.badge} ${c.status === "open" ? ui.badgeOver : c.status === "closed" ? ui.badgeOk : styles.badgeGray}`}>
                    {c.status === "open" ? "Abierto" : c.status === "closed" ? "Cerrado" : "Corte de turno"}
                  </span>
                  {c.reopenedAt && <span className={ui.firstCutBadge} title={c.reopenReason}>reabierto</span>}
                </td>
                <td>
                  <span className={`${styles.badge} ${diffClass(c.difference)}`}>{diffLabel(c.difference)}</span>
                </td>
                <td className={styles.tdMono}>{c.cardDifference != null ? diffLabel(c.cardDifference) : "—"}</td>
                <td className={styles.tdMono}>{c.onlineDifference != null ? diffLabel(c.onlineDifference) : "—"}</td>
                <td className={styles.tdMuted}>{c.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}