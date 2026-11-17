import { useState, useEffect, useContext, useMemo, useCallback, useRef } from "react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import { tijuanaDateKey } from "../../utils/date";
import ui from "./ReceiptsPage.module.css";
import { ReceiptSummary, ReceiptViewer, ReceiptDeliveryHistory } from "./ReceiptTools";

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

async function prepareDocument(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (["pdf", "xml"].includes(extension)) {
    if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name}: máximo 8 MB por archivo.`);
    if (extension === "xml") {
      const xml = new DOMParser().parseFromString(await file.text(), "application/xml");
      if (xml.querySelector("parsererror") || xml.documentElement.localName !== "Comprobante" || xml.doctype) throw new Error(`${file.name}: selecciona un XML de CFDI válido, sin DTD.`);
    }
    return { blob: new Blob([file], { type: extension === "pdf" ? "application/pdf" : "application/xml" }), name: file.name, size: file.size };
  }
  const blob = await compressImage(file);
  return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", size: blob.size };
}

const documentBundle = async (files) => new Blob([JSON.stringify({ files: await Promise.all(files.map(async (file) => ({
  name: file.name,
  content: await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file.blob);
  }),
}))) })], { type: "application/vnd.pokepalace.receipt+json" });

const emptyForm = (keep = {}) => ({
  kind: keep.kind ?? "ticket",
  paymentMethod: keep.paymentMethod ?? "",
  amount: "",
  date: keep.date ?? tijuanaDateKey(),
  vendor: "",
  note: "",
  registerExpense: false,
  expenseId: "",
  expenseAction: "none",
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
  const [listError, setListError] = useState("");
  const [notice, setNotice] = useState("");

  const [form, setForm] = useState(() => emptyForm());
  const [photo, setPhoto] = useState(null); // { blob, previewUrl, size }
  const [extraFiles, setExtraFiles] = useState([]);
  const [fileMode, setFileMode] = useState("pages");
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");
  const fileInput = useRef(null);

  const [editingEmails, setEditingEmails] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [search, setSearch] = useState({ q: "", from: "", to: "", kind: "", paymentMethod: "", incomplete: false });
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestVersion = useRef(0);
  const [showForm, setShowForm] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState(null);
  const [expenseOptions, setExpenseOptions] = useState([]);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseError, setExpenseError] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [viewer, setViewer] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const editor = useRef(null);
  const ownsExpense = editingReceipt?.expenseId && editingReceipt.source === "portal" && editingReceipt.expenseMode !== "existing";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      Object.entries(search).forEach(([key, value]) => { if (value) params.set(key, String(value)); });
      setQuery(params.toString());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!showForm || !form.date || form.kind === "voucher") return undefined;
    let active = true;
    setExpenseLoading(true); setExpenseError(""); setExpenseOptions([]);
    api.get(`/api/staff/receipts/expense-options?date=${encodeURIComponent(form.date)}`).then((data) => {
      if (active) setExpenseOptions(data.expenses);
    }).catch((e) => { if (active) setExpenseError(e.message); }).finally(() => { if (active) setExpenseLoading(false); });
    return () => { active = false; };
  }, [api, form.date, form.kind, showForm]);

  useEffect(() => { setDuplicateWarning(""); }, [form, photo, extraFiles, fileMode]);

  const loadSettings = useCallback(() => {
    api.get("/api/staff/receipts/settings")
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, [api]);

  const loadReceipts = useCallback((offset = 0) => {
    const version = ++requestVersion.current;
    if (offset) setLoadingMore(true);
    else { setLoading(true); setLoadingMore(false); }
    api.get(`/api/staff/receipts?status=${filter}&${query}&offset=${offset}`)
      .then((data) => {
        if (version !== requestVersion.current) return;
        setListError("");
        setReceipts((prev) => offset ? [...prev, ...(data.receipts ?? []).filter((r) => !prev.some((p) => p._id === r._id))] : data.receipts ?? []);
        setTotal(data.total ?? 0);
        setHasMore(data.hasMore ?? false);
        setPendingSummary(data.pendingSummary ?? null);
      })
      .catch((e) => { if (version === requestVersion.current) setListError(e.message); })
      .finally(() => { if (version === requestVersion.current) { setLoading(false); setLoadingMore(false); } });
  }, [api, filter, query]);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { loadReceipts(); return () => { requestVersion.current += 1; }; }, [loadReceipts]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  // Libera la vista previa al cambiar de foto o salir de la pestaña.
  useEffect(() => () => { if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl); }, [photo]);

  const refresh = () => { setError(""); loadSettings(); loadReceipts(); setHistoryRevision((n) => n + 1); };

  const beginEdit = (receipt) => {
    setEditingReceipt(receipt); setPhoto(null); setExtraFiles([]); setFormError("");
    setForm({ ...emptyForm(), ...receipt, amount: receipt.amount ?? "", paymentMethod: receipt.paymentMethod || "",
      expenseId: receipt.expenseId || "", expenseAction: receipt.expenseId ? "link" : "none" });
    setShowForm(true);
    window.setTimeout(() => { editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }); editor.current?.focus(); }, 0);
  };
  const cancelEdit = () => { setEditingReceipt(null); setForm(emptyForm()); setPhoto(null); setExtraFiles([]); setFormError(""); setShowForm(false); };

  const pickPhoto = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = ""; // permite volver a elegir la misma foto
    if (!files.length) return;
    if (files.length > 10) return setFormError("Selecciona hasta 10 archivos a la vez.");
    setFormError("");
    setPreparing(true);
    try {
      const prepared = [];
      for (const file of files) prepared.push(await prepareDocument(file));
      if (prepared.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) throw new Error("Selecciona archivos que sumen hasta 20 MB.");
      setPhoto({ ...prepared[0], previewUrl: URL.createObjectURL(prepared[0].blob) });
      setExtraFiles(prepared.slice(1));
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

  const saveReceipt = async (allowDuplicate = false) => {
    if (uploading || preparing) return;
    if (!photo && !editingReceipt) return setFormError("Primero elige los archivos del comprobante.");
    if (!form.paymentMethod) return setFormError("Elige cómo se pagó (efectivo, tarjeta…).");
    const amount = form.amount === "" ? null : Number(form.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return setFormError("El monto no es válido.");
    if (!form.date || form.date > tijuanaDateKey()) return setFormError("Elige una fecha válida que no sea futura.");
    const registerExpense = form.expenseAction === "create" && form.kind !== "voucher";
    if (form.expenseAction === "link" && !form.expenseId && form.kind !== "voucher") return setFormError("Elige el gasto que quieres vincular.");
    if (registerExpense && !(amount > 0)) return setFormError("Para anotarlo como gasto escribe el monto.");

    const params = new URLSearchParams({ kind: form.kind, paymentMethod: form.paymentMethod, date: form.date });
    if (amount !== null) params.set("amount", String(amount));
    if (form.vendor.trim()) params.set("vendor", form.vendor.trim());
    if (form.note.trim()) params.set("note", form.note.trim());
    if (registerExpense) {
      params.set("registerExpense", "true");
      params.set("category", form.category);
    }
    if (form.expenseAction === "link" && form.kind !== "voucher" && form.expenseId) params.set("expenseId", form.expenseId);
    if (allowDuplicate) params.set("allowDuplicate", "true");

    setFormError("");
    setUploading(true);
    try {
      if (editingReceipt) {
        const payload = { ...Object.fromEntries(params), amount: form.amount === "" ? "" : String(amount),
          vendor: form.vendor.trim(), note: form.note.trim(), revision: editingReceipt.revision ?? 0,
          expenseId: form.expenseAction === "link" ? form.expenseId : "" };
        await api.patch(`/api/staff/receipts/${editingReceipt._id}`, payload);
        setNotice(ownsExpense ? "Comprobante y gasto asociado actualizados." : "Comprobante actualizado.");
        cancelEdit(); loadReceipts();
        return;
      }
      const bundle = await documentBundle(fileMode === "pages" ? [photo, ...extraFiles] : [photo]);
      const { expense } = await api.upload(`/api/staff/receipts?${params}`, bundle);
      setNotice(
        `Comprobante guardado${expense ? " y anotado como gasto en Finanzas" : form.expenseId ? " y vinculado al gasto existente" : ""}. ` +
        (settings?.accountantEmails?.length && settings.emailConfigured ? "Queda pendiente para el próximo envío aplicable." : "Queda pendiente hasta configurar el envío al contador.")
      );
      if (fileMode === "separate" && extraFiles.length) {
        setPhoto({ ...extraFiles[0], previewUrl: URL.createObjectURL(extraFiles[0].blob) });
        setExtraFiles((files) => files.slice(1));
        setNotice("Comprobante guardado. Revisa los datos del siguiente antes de guardarlo.");
      } else { setPhoto(null); setExtraFiles([]); }
      // Se conservan tipo, forma de pago y fecha: casi siempre se suben
      // varios tickets del mismo día seguidos.
      setForm((prev) => emptyForm(prev));
      if (filter === "sent") setFilter("pending");
      else loadReceipts();
    } catch (e) {
      if (e.code === "POSSIBLE_DUPLICATE") setDuplicateWarning(e.message);
      else setFormError(e.message);
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
    setNotice("");
    setError("");
    try {
      const result = await api.post("/api/staff/receipts/send-now", {});
      setNotice(result.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
      loadSettings(); loadReceipts(); setHistoryRevision((n) => n + 1);
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

  return (
    <div className={ui.root}>
      <div className={`${styles.pageHeader} ${ui.pageHeader}`}>
        <div>
          <h1 className={styles.pageTitle}>Comprobantes</h1>
          <p className={styles.pageSubtitle}>
            Organiza tus documentos, revisa los pendientes y prepara el envío al contador.
          </p>
        </div>
        <div className={ui.headerActions}>
          <button className={styles.btnPrimary} type="button" disabled={uploading || preparing} onClick={() => { if (editingReceipt) cancelEdit(); setShowForm(true); window.setTimeout(() => editor.current?.scrollIntoView({ behavior: "smooth" }), 0); }}>+ Subir comprobante</button>
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
      {listError && <p className={ui.errorText} role="alert">{listError}</p>}

      <ReceiptSummary summary={pendingSummary} loading={loading} onIncomplete={() => { setFilter("pending"); setSearch({ q: "", from: "", to: "", kind: "", paymentMethod: "", incomplete: true }); }} />

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
                Cada lunes se mandan los pendientes subidos antes de ese lunes, incluidos los antiguos, a <b>{emails.join(", ")}</b>.
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
      {showForm && <section className={`${styles.card} ${ui.uploadCard}`} ref={editor} tabIndex={-1}>
        <p className={styles.cardTitle}>{editingReceipt ? "Editar comprobante pendiente" : "Subir comprobante"}</p>
        {formError && <p className={ui.errorText} role="alert">{formError}</p>}
        {duplicateWarning && <div className={ui.warn} role="alert"><p>{duplicateWarning}</p><button className={styles.btnGhost} type="button" disabled={uploading} onClick={() => saveReceipt(true)}>Es otra compra: guardar de todas formas</button></div>}

        <fieldset className={ui.editorFields} disabled={uploading || preparing}><div className={ui.uploadGrid}>
          <div className={ui.photoSlot}>
            {editingReceipt ? <button type="button" className={ui.photoButton} onClick={() => setViewer(editingReceipt)}><strong>Ver archivos del comprobante</strong></button> : <>
            <label className={styles.label} htmlFor="receipt-file-mode">Si seleccionas varios archivos</label>
            <select id="receipt-file-mode" className={styles.input} value={fileMode} onChange={(e) => setFileMode(e.target.value)}>
              <option value="pages">Son páginas o archivos del mismo comprobante</option>
              <option value="separate">Son comprobantes distintos: revisar uno por uno</option>
            </select>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,.pdf,.xml"
              multiple
              className={ui.hiddenInput}
              onChange={pickPhoto}
              aria-label="Archivos del comprobante"
            />
            {photo ? (
              <div className={ui.preview}>
                {photo.blob.type.startsWith("image/") ? <img src={photo.previewUrl} alt="Vista previa del comprobante" /> : <div className={ui.filePreview}><strong>{photo.blob.type === "application/pdf" ? "PDF" : "XML"}</strong><a href={photo.previewUrl} target="_blank" rel="noopener noreferrer">Revisar archivo</a></div>}
                <p className={ui.itemText}>{photo.name}</p>
                <div className={ui.previewActions}>
                  <button type="button" className={styles.btnGhost} onClick={() => fileInput.current?.click()}>Cambiar archivos</button>
                  <button type="button" className={styles.btnGhost} onClick={() => { setPhoto(null); setExtraFiles([]); }}>Quitar</button>
                </div>
                <small>{Math.round(photo.size / 1024)} KB listos para subir</small>
                {extraFiles.length > 0 && <div className={ui.fileQueue}><strong>{fileMode === "pages" ? "Se guardarán juntos" : "Pendientes de revisar después"}</strong><ul>{extraFiles.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}<button type="button" aria-label={`Quitar ${file.name}`} onClick={() => setExtraFiles((files) => files.filter((_, i) => i !== index))}>×</button></li>)}</ul></div>}
              </div>
            ) : (
              <button
                type="button"
                className={ui.photoButton}
                onClick={() => fileInput.current?.click()}
                disabled={preparing}
              >
                <span aria-hidden="true">📷</span>
                <strong>{preparing ? "Preparando archivos…" : "Tomar foto o elegir archivos"}</strong>
                <small>Imagen, PDF o XML · hasta 10 archivos, 8 MB por archivo y 20 MB en total</small>
              </button>
            )}
            </>}
          </div>

          <div className={ui.fields}>
            <span className={ui.fieldTitle}>¿Qué es?</span>
            <div className={ui.chips}>
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={form.kind === k.id}
                  onClick={() => setForm((f) => ({ ...f, kind: k.id, ...(k.id === "voucher" && !ownsExpense ? { expenseAction: "none", expenseId: "" } : {}) }))}
                  disabled={Boolean(ownsExpense && k.id === "voucher")}
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
                {ownsExpense ? <p>Este comprobante creó un gasto. Sus cambios de monto, fecha y descripción también se guardarán en Finanzas.</p> : <>
                  <label htmlFor="receipt-expense-action">Registro en Finanzas</label>
                  <select id="receipt-expense-action" className={styles.input} value={form.expenseAction} onChange={(e) => setForm((f) => ({ ...f, expenseAction: e.target.value, expenseId: "" }))}>
                    <option value="none">Solo guardar comprobante</option>
                    {!editingReceipt && <option value="create">Crear un gasto nuevo</option>}
                    <option value="link">Vincular a un gasto existente</option>
                  </select>
                  {form.expenseAction === "link" && <>
                    <label htmlFor="receipt-expense-id">Gasto de la fecha seleccionada</label>
                    <select id="receipt-expense-id" className={styles.input} value={form.expenseId} onChange={(e) => {
                      const expense = expenseOptions.find((item) => item._id === e.target.value);
                      setForm((f) => ({ ...f, expenseId: e.target.value, ...(expense && { amount: String(expense.amount) }) }));
                    }} disabled={expenseLoading}>
                      <option value="">{expenseLoading ? "Cargando gastos…" : "Selecciona un gasto"}</option>
                      {form.expenseId && !expenseOptions.some((e) => e._id === form.expenseId) && <option value={form.expenseId}>Gasto vinculado actual</option>}
                      {expenseOptions.map((e) => <option key={e._id} value={e._id}>{fmtMXN(e.amount)} · {e.description}</option>)}
                    </select>
                    <small>Se conserva el gasto existente. La fecha y el monto deben coincidir.</small>
                    {!expenseLoading && !expenseError && !expenseOptions.length && <p>No hay gastos de esta fecha. Cambia la fecha para buscar otra compra.</p>}
                  </>}
                  {expenseError && <p role="alert" className={ui.errorText}>{expenseError}</p>}
                  {form.expenseAction === "create" && expenseOptions.some((e) => e.amount === Number(form.amount)) && <p className={ui.warn}>Hay un gasto con esta fecha y monto. Revisa «Vincular a un gasto existente» para evitar duplicarlo.</p>}
                </>}
                {form.expenseAction === "create" && (
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
                onClick={() => saveReceipt()}
                disabled={uploading || preparing || (!editingReceipt && settings?.storageConfigured === false)}
              >
                {uploading ? "Guardando…" : editingReceipt ? "Guardar cambios" : "Guardar comprobante"}
              </button>
              <button className={styles.btnGhost} type="button" onClick={cancelEdit}>Cancelar</button>
            </div>
          </div>
        </div></fieldset>
      </section>}

      {/* ── Lo que va en el próximo envío ── */}
      <div className={ui.filters} aria-label="Buscar comprobantes">
        <label>Buscar proveedor o nota<input className={styles.input} type="search" maxLength={120} value={search.q} onChange={(e) => setSearch((s) => ({ ...s, q: e.target.value }))} placeholder="Ej. Costco" /></label>
        <label>Desde<input className={styles.input} type="date" value={search.from} onChange={(e) => setSearch((s) => ({ ...s, from: e.target.value }))} /></label>
        <label>Hasta<input className={styles.input} type="date" value={search.to} onChange={(e) => setSearch((s) => ({ ...s, to: e.target.value }))} /></label>
        <label>Tipo<select className={styles.input} value={search.kind} onChange={(e) => setSearch((s) => ({ ...s, kind: e.target.value }))}><option value="">Todos</option>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
        <label>Forma de pago<select className={styles.input} value={search.paymentMethod} onChange={(e) => setSearch((s) => ({ ...s, paymentMethod: e.target.value }))}><option value="">Todas</option>{PAYMENTS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label className={ui.checkFilter}><input type="checkbox" checked={search.incomplete} onChange={(e) => setSearch((s) => ({ ...s, incomplete: e.target.checked }))} />Sin monto</label>
        <button className={styles.btnGhost} type="button" onClick={() => setSearch({ q: "", from: "", to: "", kind: "", paymentMethod: "", incomplete: false })}>Limpiar filtros</button>
      </div>

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
                <button type="button" onClick={() => setViewer(r)} className={ui.thumb} title="Ver comprobante" aria-label="Ver comprobante">
                  {!r.documents?.length || r.documents[0].mimeType.startsWith("image/") ? <img src={thumbUrl(r.imageUrl)} alt={`Foto: ${kind.label} ${r.date}`} loading="lazy" /> : <span>{r.documents[0].mimeType === "application/pdf" ? "PDF" : "XML"}</span>}
                </button>
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
                    {r.documents?.length > 1 && <span>{r.documents.length} archivos</span>}
                    {r.processing && <span>En proceso</span>}
                    {r.sentToAccountantAt
                      ? <span className={ui.sent}>✓ Enviado el {fmtSentAt(r.sentToAccountantAt)}</span>
                      : <span className={ui.pending}>⏳ Por enviar</span>}
                  </div>
                </div>
                {!r.sentToAccountantAt && !r.processing && <button className={styles.btnGhost} type="button" disabled={uploading || preparing} onClick={() => beginEdit(r)}>Editar</button>}
                {!r.sentToAccountantAt && !r.processing && (
                  confirmDel === r._id ? (
                    <div className={ui.confirmDelete}>
                      <span>{r.source === "portal" && r.expenseId && r.expenseMode !== "existing" ? "¿Borrar comprobante y su gasto?" : r.expenseId ? "¿Borrar comprobante? El gasto existente se conserva." : "¿Borrar comprobante?"}</span>
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
      {!loading && <div className={ui.formActions}><span className={ui.muted} role="status">{receipts.length} de {total} comprobantes</span>{hasMore && <button className={styles.btnGhost} type="button" onClick={() => loadReceipts(receipts.length)} disabled={loadingMore}>{loadingMore ? "Cargando…" : "Cargar más"}</button>}</div>}
      <button className={styles.btnGhost} type="button" aria-expanded={showHistory} onClick={() => setShowHistory((value) => !value)}>{showHistory ? "Ocultar historial de envíos" : "Ver historial de envíos"}</button>
      {showHistory && <ReceiptDeliveryHistory api={api} revision={historyRevision} />}
      {viewer && <ReceiptViewer receipt={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
