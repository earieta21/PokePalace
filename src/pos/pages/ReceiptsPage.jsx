import { useState, useEffect, useContext, useMemo, useCallback, useRef } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import { tijuanaDateKey } from "../../utils/date";
import ui from "./ReceiptsPage.module.css";

/* Comprobantes para el contador: se sube la foto de cada factura, ticket o
   voucher, separada por forma de pago como en el corte de caja, y cada lunes
   el servidor le manda al contador todo lo de la semana anterior
   (backend/utils/accountantReport.js). */

const KINDS = [
  { id: "factura", label: "Factura (CFDI)",     icon: "🧾", hint: "Compra con RFC" },
  { id: "ticket",  label: "Ticket / nota",      icon: "🗒️", hint: "Sin factura" },
  { id: "voucher", label: "Voucher terminal",   icon: "💳", hint: "Ventas con tarjeta" },
  { id: "otro",    label: "Otro",               icon: "📄", hint: "Cualquier otro" },
];
const kindOf = (id) => KINDS.find((k) => k.id === id) ?? KINDS[3];

const PAYMENTS = [
  { id: "efectivo",      label: "Efectivo",      icon: "💵" },
  { id: "tarjeta",       label: "Tarjeta",       icon: "💳" },
  { id: "transferencia", label: "Transferencia", icon: "🏦" },
  { id: "otro",          label: "Otro",          icon: "➕" },
];
const PAYMENT_LABEL = { ...Object.fromEntries(PAYMENTS.map((p) => [p.id, p.label])), sin_dato: "Sin especificar" };

const EXPENSE_CATEGORIES = [
  "Ingredientes", "Bebidas", "Limpieza", "Empaque", "Renta",
  "Servicios", "Nómina", "Marketing", "Mantenimiento", "Otros",
];

const FILTERS = [
  { id: "pending", label: "Por enviar" },
  { id: "sent",    label: "Enviados" },
  { id: "all",     label: "Todos" },
];

const fmtMXN = (n) => `$${(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Date-key ya resuelto en hora Tijuana → se arma en UTC para no correrlo un día.
const fmtDayKey = (key, opts = { weekday: "long", day: "numeric", month: "long" }) => {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-MX", { ...opts, timeZone: "UTC" });
};
const fmtSentAt = (iso) => new Date(iso).toLocaleDateString("es-MX", {
  day: "numeric", month: "short", timeZone: "America/Tijuana",
});

// Miniatura cuadrada servida por Cloudinary en vez de bajar la foto completa.
const thumbUrl = (url) => {
  const marker = "/image/upload/";
  if (typeof url !== "string" || !url.startsWith("https://res.cloudinary.com/") || !url.includes(marker)) return url;
  return url.replace(marker, `${marker}c_fill,w_160,h_160,q_auto,f_auto/`);
};

/* Achica la foto en el navegador (máx. 2000 px, JPG) antes de subirla: una
   foto de celular de 4-8 MB queda en ~300-700 KB, sube rápido con datos y
   cabe en el correo semanal. */
async function compressImage(file, { maxSide = 2000, quality = 0.82 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(
        "No se pudo leer esa imagen. Tómala directo con la cámara o conviértela a JPG."
      ));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // un PNG con fondo transparente no queda negro
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("No se pudo preparar la foto. Intenta con otra.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const emptyForm = (keep = {}) => ({
  kind: keep.kind ?? "ticket",
  paymentMethod: keep.paymentMethod ?? "",
  amount: "",
  date: keep.date ?? tijuanaDateKey(),
  vendor: "",
  note: "",
  registerExpense: false,
  category: "Ingredientes",
});

export default function ReceiptsPage({ styles }) {
  const { staffToken, staffUser } = useContext(StaffAuthContext);
  const api = useMemo(() => createStaffApi(staffToken), [staffToken]);
  // El servidor lo vuelve a exigir; esto solo evita mostrar botones que fallarían.
  const canManage = staffUser?.role === "owner" || staffUser?.role === "admin";

  const [settings, setSettings] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [pendingSummary, setPendingSummary] = useState(null);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [form, setForm] = useState(() => emptyForm());
  const [photo, setPhoto] = useState(null); // { blob, previewUrl, size }
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");
  const fileInput = useRef(null);

  const [editingEmails, setEditingEmails] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const loadSettings = useCallback(() => {
    api.get("/api/staff/receipts/settings")
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, [api]);

  const loadReceipts = useCallback(() => {
    setLoading(true);
    api.get(`/api/staff/receipts?status=${filter}`)
      .then((data) => {
        setReceipts(data.receipts ?? []);
        setPendingSummary(data.pendingSummary ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [api, filter]);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  // Libera la vista previa al cambiar de foto o salir de la pestaña.
  useEffect(() => () => { if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl); }, [photo]);

  const refresh = () => { setError(""); loadSettings(); loadReceipts(); };

  const pickPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite volver a elegir la misma foto
    if (!file) return;
    setFormError("");
    setPreparing(true);
    try {
      const blob = await compressImage(file);
      setPhoto({ blob, previewUrl: URL.createObjectURL(blob), size: blob.size });
    } catch (e) {
      setFormError(e.message);
    } finally {
      setPreparing(false);
    }
  };

  const nextSendLabel = () => {
    if (!settings?.nextSendDate) return "";
    return settings.nextSendDate <= settings.today
      ? "hoy, en la próxima revisión (cada hora desde las 8:00 am)"
      : `el ${fmtDayKey(settings.nextSendDate)} a las 8:00 am`;
  };

  const saveReceipt = async () => {
    if (!photo) return setFormError("Primero toma o elige la foto del comprobante.");
    if (!form.paymentMethod) return setFormError("Elige cómo se pagó (efectivo, tarjeta…).");
    const amount = form.amount === "" ? null : Number(form.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return setFormError("El monto no es válido.");
    const registerExpense = form.registerExpense && form.kind !== "voucher";
    if (registerExpense && !(amount > 0)) return setFormError("Para anotarlo como gasto escribe el monto.");

    const params = new URLSearchParams({ kind: form.kind, paymentMethod: form.paymentMethod, date: form.date });
    if (amount !== null) params.set("amount", String(amount));
    if (form.vendor.trim()) params.set("vendor", form.vendor.trim());
    if (form.note.trim()) params.set("note", form.note.trim());
    if (registerExpense) {
      params.set("registerExpense", "true");
      params.set("category", form.category);
    }

    setFormError("");
    setUploading(true);
    try {
      const { expense } = await api.upload(`/api/staff/receipts?${params}`, photo.blob);
      setNotice(
        `Comprobante guardado${expense ? " y anotado como gasto en Finanzas" : ""}. ` +
        `Se le manda al contador ${nextSendLabel() || "el próximo lunes"}.`
      );
      setPhoto(null);
      // Se conservan tipo, forma de pago y fecha: casi siempre se suben
      // varios tickets del mismo día seguidos.
      setForm((prev) => emptyForm(prev));
      if (filter === "sent") setFilter("pending");
      else loadReceipts();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const removeReceipt = async (receipt) => {
    setConfirmDel(null);
    try {
      const result = await api.delete(`/api/staff/receipts/${receipt._id}`);
      setNotice(result.expenseRemoved
        ? "Se borró el comprobante y su gasto en Finanzas."
        : "Se borró el comprobante.");
      loadReceipts();
    } catch (e) { setError(e.message); }
  };

  const saveEmails = async () => {
    setEmailSaving(true);
    setError("");
    try {
      const { accountantEmails } = await api.put("/api/staff/receipts/settings", { accountantEmails: emailDraft });
      setSettings((prev) => ({ ...prev, accountantEmails }));
      setEditingEmails(false);
      setNotice(accountantEmails.length
        ? `Listo: los comprobantes se mandarán a ${accountantEmails.join(", ")}.`
        : "Se quitó el correo del contador; no se mandará nada hasta que pongas uno.");
    } catch (e) {
      setError(e.message);
    } finally {
      setEmailSaving(false);
    }
  };

  const sendNow = async () => {
    const count = pendingSummary?.count ?? 0;
    const to = settings?.accountantEmails?.join(", ");
    if (!window.confirm(`¿Mandar ahora ${count} comprobante${count !== 1 ? "s" : ""} a ${to}? El envío del lunes seguirá igual con lo que subas después.`)) return;
    setSending(true);
    setError("");
    try {
      const result = await api.post("/api/staff/receipts/send-now", {});
      setNotice(result.message);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const pendingCount = pendingSummary?.count ?? 0;
  const emails = settings?.accountantEmails ?? [];
  // El botón siempre se ve para dueño/admin; si no se puede enviar, se dice
  // por qué en vez de esconderlo.
  const sendBlockReason = !settings || loading ? ""
    : emails.length === 0 ? "Primero agrega el correo del contador."
    : pendingCount === 0 ? "No hay comprobantes por enviar."
    : !settings.emailConfigured ? "Falta configurar el correo en el servidor."
    : "";
  const sendDisabled = sending || !settings || loading || Boolean(sendBlockReason);
  const methodTotals = PAYMENTS.map((p) => p.id).concat("sin_dato")
    .filter((id) => pendingSummary?.byPaymentMethod?.[id])
    .map((id) => ({ id, ...pendingSummary.byPaymentMethod[id] }));

  return (
    <div className={ui.root}>
      <div className={`${styles.pageHeader} ${ui.pageHeader}`}>
        <div>
          <h1 className={styles.pageTitle}>Comprobantes</h1>
          <p className={styles.pageSubtitle}>
            Sube la foto de cada factura, ticket o voucher. Cada lunes se le mandan solos a tu contador.
          </p>
        </div>
        <div className={ui.headerActions}>
          <button className={styles.btnGhost} type="button" onClick={refresh}>↻ Actualizar</button>
          {canManage && (
            <div className={ui.sendNow}>
              <button className={styles.btnGhost} type="button" onClick={sendNow} disabled={sendDisabled}>
                {sending ? "Enviando…" : `✉ Enviar ahora${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
              </button>
              {sendBlockReason && <small className={ui.sendHint}>{sendBlockReason}</small>}
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div className={ui.notice} role="status">
          <span>✓</span>{notice}
          <button type="button" onClick={() => setNotice("")} aria-label="Cerrar aviso">×</button>
        </div>
      )}
      {error && <p className={ui.errorText} role="alert">{error}</p>}

      {settings && !settings.storageConfigured && (
        <p className={ui.warn}>⚠ Falta configurar Cloudinary en el servidor: todavía no se pueden subir fotos.</p>
      )}
      {settings && !settings.emailConfigured && (
        <p className={ui.warn}>⚠ Falta configurar el correo (Brevo) en el servidor: los comprobantes se guardan, pero no se le mandan al contador.</p>
      )}

      {/* ── A quién y cuándo ── */}
      <section className={`${styles.card} ${ui.accountantCard}`}>
        <div className={ui.accountantHead}>
          <span className={ui.accountantIcon} aria-hidden="true">📬</span>
          <div className={ui.accountantText}>
            <strong>Envío al contador</strong>
            {!settings ? (
              <small>Cargando…</small>
            ) : emails.length > 0 ? (
              <small>
                Cada lunes se manda lo de la semana anterior a <b>{emails.join(", ")}</b>.
                {" "}Próximo envío: {nextSendLabel()}.
              </small>
            ) : (
              <small>
                Todavía no hay correo del contador
                {canManage ? " — agrégalo para empezar los envíos." : " — pídele al dueño o admin que lo agregue."}
              </small>
            )}
          </div>
          {canManage && !editingEmails && settings && (
            <button
              className={styles.btnGhost}
              type="button"
              onClick={() => { setEmailDraft(emails.join(", ")); setEditingEmails(true); }}
            >
              {emails.length ? "Cambiar" : "+ Agregar correo"}
            </button>
          )}
        </div>
        {editingEmails && (
          <div className={ui.emailEditor}>
            <label className={styles.label} htmlFor="accountant-emails">Correo del contador (hasta 3, separados por coma)</label>
            <input
              id="accountant-emails"
              className={styles.input}
              type="text"
              inputMode="email"
              autoComplete="off"
              placeholder="contador@despacho.com, yo@pokepalace.org"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveEmails()}
            />
            <div className={ui.formActions}>
              <button className={styles.btnPrimary} type="button" onClick={saveEmails} disabled={emailSaving}>
                {emailSaving ? "Guardando…" : "Guardar"}
              </button>
              <button className={styles.btnGhost} type="button" onClick={() => setEditingEmails(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </section>

      {/* ── Subir comprobante ── */}
      <section className={`${styles.card} ${ui.uploadCard}`}>
        <p className={styles.cardTitle}>Subir comprobante</p>
        {formError && <p className={ui.errorText} role="alert">{formError}</p>}

        <div className={ui.uploadGrid}>
          <div className={ui.photoSlot}>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className={ui.hiddenInput}
              onChange={pickPhoto}
              aria-label="Foto del comprobante"
            />
            {photo ? (
              <div className={ui.preview}>
                <img src={photo.previewUrl} alt="Vista previa del comprobante" />
                <div className={ui.previewActions}>
                  <button type="button" className={styles.btnGhost} onClick={() => fileInput.current?.click()}>Cambiar foto</button>
                  <button type="button" className={styles.btnGhost} onClick={() => setPhoto(null)}>Quitar</button>
                </div>
                <small>{Math.round(photo.size / 1024)} KB listos para subir</small>
              </div>
            ) : (
              <button
                type="button"
                className={ui.photoButton}
                onClick={() => fileInput.current?.click()}
                disabled={preparing}
              >
                <span aria-hidden="true">📷</span>
                <strong>{preparing ? "Preparando foto…" : "Tomar o elegir foto"}</strong>
                <small>Que se lean bien el total, la fecha y el RFC</small>
              </button>
            )}
          </div>

          <div className={ui.fields}>
            <span className={ui.fieldTitle}>¿Qué es?</span>
            <div className={ui.chips}>
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={form.kind === k.id}
                  onClick={() => setForm((f) => ({ ...f, kind: k.id }))}
                  title={k.hint}
                >
                  <span aria-hidden="true">{k.icon}</span>{k.label}
                </button>
              ))}
            </div>

            <span className={ui.fieldTitle}>¿Cómo se pagó?</span>
            <div className={ui.chips}>
              {PAYMENTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={form.paymentMethod === p.id}
                  onClick={() => setForm((f) => ({ ...f, paymentMethod: p.id }))}
                >
                  <span aria-hidden="true">{p.icon}</span>{p.label}
                </button>
              ))}
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="receipt-amount">Monto total (MXN)</label>
                <input
                  id="receipt-amount"
                  className={styles.input}
                  type="number" min="0" step="0.01" inputMode="decimal" placeholder="Opcional"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="receipt-date">Fecha del comprobante</label>
                <input
                  id="receipt-date"
                  className={styles.input}
                  type="date"
                  max={tijuanaDateKey()}
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="receipt-vendor">Proveedor</label>
                <input
                  id="receipt-vendor"
                  className={styles.input}
                  maxLength={120}
                  placeholder="Ej: Costco, CFE, terminal Clip…"
                  value={form.vendor}
                  onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="receipt-note">Nota</label>
                <input
                  id="receipt-note"
                  className={styles.input}
                  maxLength={300}
                  placeholder="Opcional"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>

            {form.kind !== "voucher" && (
              <div className={ui.expenseToggle}>
                <label>
                  <input
                    type="checkbox"
                    checked={form.registerExpense}
                    onChange={(e) => setForm((f) => ({ ...f, registerExpense: e.target.checked }))}
                  />
                  Anotar también como gasto en Finanzas
                </label>
                <small>Déjalo sin marcar si ya lo capturaste en Finanzas o llegó por Inventario, para no contarlo doble.</small>
                {form.registerExpense && (
                  <div className={ui.chips}>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={form.category === c}
                        onClick={() => setForm((f) => ({ ...f, category: c }))}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={ui.formActions}>
              <button
                className={styles.btnPrimary}
                type="button"
                onClick={saveReceipt}
                disabled={uploading || preparing || settings?.storageConfigured === false}
              >
                {uploading ? "Subiendo…" : "Guardar comprobante"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Lo que va en el próximo envío ── */}
      <section className={ui.pendingStrip} aria-label="Pendientes de enviar">
        <div className={ui.pendingTotal}>
          <small>Por enviar</small>
          <strong>{pendingCount}</strong>
          <em>{fmtMXN(pendingSummary?.total)}</em>
        </div>
        {methodTotals.length === 0 ? (
          <p className={ui.muted}>No hay comprobantes pendientes.</p>
        ) : methodTotals.map((m) => (
          <div key={m.id} className={ui.methodTotal}>
            <small>{PAYMENT_LABEL[m.id]}</small>
            <strong>{fmtMXN(m.total)}</strong>
            <em>{m.count} comprobante{m.count !== 1 ? "s" : ""}</em>
          </div>
        ))}
      </section>

      {/* ── Lista ── */}
      <div className={ui.filterTabs} role="tablist" aria-label="Filtrar comprobantes">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}{f.id === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={ui.muted}>Cargando comprobantes…</p>
      ) : receipts.length === 0 ? (
        <div className={ui.empty}>
          <span aria-hidden="true">🧾</span>
          <strong>{filter === "sent" ? "Todavía no se ha enviado nada" : "No hay comprobantes aquí"}</strong>
          <p>{filter === "pending" ? "Lo que subas aparecerá aquí hasta que se le mande al contador." : "Cambia el filtro para ver otros."}</p>
        </div>
      ) : (
        <ul className={ui.list}>
          {receipts.map((r) => {
            const kind = kindOf(r.kind);
            return (
              <li key={r._id} className={ui.item}>
                <a href={r.imageUrl} target="_blank" rel="noopener noreferrer" className={ui.thumb} title="Ver foto completa">
                  <img src={thumbUrl(r.imageUrl)} alt={`Foto: ${kind.label} ${r.date}`} loading="lazy" />
                </a>
                <div className={ui.itemBody}>
                  <div className={ui.itemTop}>
                    <span className={ui.itemDate}>{fmtDayKey(r.date, { day: "numeric", month: "short", year: "numeric" })}</span>
                    <span className={ui.tag}>{kind.icon} {kind.label}</span>
                    <span className={`${ui.tag} ${ui.payTag}`}>{PAYMENT_LABEL[r.paymentMethod || "sin_dato"]}</span>
                    <span className={ui.itemAmount}>{r.amount != null ? fmtMXN(r.amount) : "sin monto"}</span>
                  </div>
                  {(r.vendor || r.note) && (
                    <p className={ui.itemText}>{[r.vendor, r.note].filter(Boolean).join(" — ")}</p>
                  )}
                  <div className={ui.itemMeta}>
                    <span>{r.source === "telegram" ? "🤖 " : ""}Subido por {r.uploadedBy}</span>
                    {r.expenseId && <span>💸 En Finanzas</span>}
                    {r.sentToAccountantAt
                      ? <span className={ui.sent}>✓ Enviado el {fmtSentAt(r.sentToAccountantAt)}</span>
                      : <span className={ui.pending}>⏳ Por enviar</span>}
                  </div>
                </div>
                {!r.sentToAccountantAt && (
                  confirmDel === r._id ? (
                    <div className={ui.confirmDelete}>
                      <span>{r.source === "portal" && r.expenseId ? "¿Borrar también su gasto?" : "¿Borrar?"}</span>
                      <button type="button" onClick={() => removeReceipt(r)}>Sí</button>
                      <button type="button" onClick={() => setConfirmDel(null)}>No</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={ui.deleteButton}
                      onClick={() => setConfirmDel(r._id)}
                      aria-label="Borrar comprobante"
                      title="Borrar comprobante"
                    >
                      ×
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
