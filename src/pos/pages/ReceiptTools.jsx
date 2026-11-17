import { useEffect, useRef, useState } from "react";
import ui from "./ReceiptsPage.module.css";

const money = (n) => Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const paymentLabels = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", otro: "Otro", sin_dato: "Sin especificar" };
const groups = { purchases: "Compras: facturas y tickets", vouchers: "Vouchers de ventas", other: "Otros documentos" };

export function ReceiptSummary({ summary, loading, onIncomplete }) {
  if (!summary) return <p className={ui.muted}>{loading ? "Cargando resumen…" : "No se pudo cargar el resumen."}</p>;
  return <section className={ui.pendingStrip} aria-label="Resumen de todos los pendientes">
    <div className={ui.pendingTotal}><small>Todos los pendientes</small><strong>{summary.count}</strong>
      <span>comprobantes</span>
      {summary.withoutAmount > 0 && <button type="button" onClick={onIncomplete} className={ui.textButton}>{summary.withoutAmount} sin monto · Revisar</button>}
    </div>
    {Object.entries(groups).map(([key, label]) => {
      const group = summary.groups?.[key];
      if (!group?.count) return null;
      return <div className={ui.methodTotal} key={key}>
        <small>{label}</small><strong>{money(group.total)}</strong><em>Total capturado · {group.count} documentos</em>
        {Object.entries(group.byPaymentMethod || {}).map(([method, value]) => <span className={ui.summaryLine} key={method}>{paymentLabels[method]}: {money(value.total)}</span>)}
        {group.withoutAmount > 0 && <span className={ui.pending}>{group.withoutAmount} sin monto</span>}
      </div>;
    })}
    {summary.count === 0 && <p className={ui.muted}>No hay comprobantes pendientes de enviar.</p>}
  </section>;
}

export function ReceiptViewer({ receipt, onClose }) {
  const dialog = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [documentIndex, setDocumentIndex] = useState(0);
  const [xml, setXml] = useState("");
  const [imageRatio, setImageRatio] = useState(1);
  const documents = receipt.documents?.length ? receipt.documents : [{ url: receipt.imageUrl, mimeType: "image/jpeg", name: "Foto del comprobante" }];
  const document = documents[documentIndex];
  const isImage = document.mimeType.startsWith("image/");
  useEffect(() => {
    setZoom(1); setRotation(0); setXml(""); setError("");
    if (document.mimeType !== "application/xml") return undefined;
    const controller = new AbortController();
    fetch(document.url, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error("No se pudo abrir el XML.");
      return response.text();
    }).then(setXml).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [document.url, document.mimeType]);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const download = async () => {
    setError(""); setDownloading(true);
    try {
      const result = await fetch(document.url);
      if (!result.ok) throw new Error("No se pudo descargar el comprobante.");
      const url = URL.createObjectURL(await result.blob());
      const link = window.document.createElement("a");
      const extension = { "application/pdf": "pdf", "application/xml": "xml", "image/png": "png", "image/webp": "webp" }[document.mimeType] || "jpg";
      link.href = url; link.download = `comprobante-${receipt.date}-${receipt._id}-${documentIndex + 1}.${extension}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError("No se pudo descargar. Usa «Abrir original» para guardar el archivo."); }
    finally { setDownloading(false); }
  };
  return <dialog ref={dialog} className={ui.viewer} onCancel={onClose} aria-labelledby="receipt-viewer-title">
    <div className={ui.viewerToolbar}>
      <h2 id="receipt-viewer-title">{receipt.vendor || "Comprobante"} · {receipt.date}</h2>
      <button type="button" onClick={onClose} autoFocus>Cerrar</button>
    </div>
    <div className={ui.viewerToolbar}>
      {documents.length > 1 && <label>Archivo <select value={documentIndex} onChange={(e) => setDocumentIndex(Number(e.target.value))}>{documents.map((doc, i) => <option key={doc.url} value={i}>{i + 1}. {doc.name}</option>)}</select></label>}
      {isImage && <>
      <button type="button" onClick={() => setZoom((n) => Math.max(0.5, n - 0.25))} disabled={zoom <= 0.5} aria-label="Alejar">−</button>
      <span aria-live="polite">{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={() => setZoom((n) => Math.min(3, n + 0.25))} disabled={zoom >= 3} aria-label="Acercar">+</button>
      <button type="button" onClick={() => setRotation((n) => (n + 90) % 360)}>Girar</button>
      </>}
      <button type="button" onClick={download} disabled={downloading}>{downloading ? "Descargando…" : "Descargar"}</button>
      <a href={document.url} target="_blank" rel="noopener noreferrer">Abrir original</a>
    </div>
    {error && <p role="alert" className={ui.errorText}>{error}</p>}
    <div className={ui.viewerCanvas}>{isImage ? <div className={ui.viewerImageStage} style={{ width: `${zoom * 100}%`, aspectRatio: rotation % 180 ? 1 / imageRatio : imageRatio }}><img src={document.url} alt={`Comprobante de ${receipt.vendor || receipt.date}`} onLoad={(event) => setImageRatio(event.target.naturalWidth / event.target.naturalHeight || 1)} style={{ width: rotation % 180 ? `${imageRatio * 100}%` : "100%", transform: `translate(-50%, -50%) rotate(${rotation}deg)` }} /></div>
      : document.mimeType === "application/pdf" ? <><p>Si el PDF no se muestra, usa «Abrir original» o «Descargar».</p><iframe src={document.url} title="Vista previa del PDF" sandbox="" /></>
      : <pre>{xml || "Cargando XML…"}</pre>}</div>
  </dialog>;
}

const deliveryLabels = { sending: "En proceso", sent: "Aceptado por el servicio de correo", partial: "Envío parcial", failed: "Fallido", uncertain: "Requiere revisión" };
export function ReceiptDeliveryHistory({ api, revision }) {
  const [rows, setRows] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  useEffect(() => { setOffset(0); setRows([]); }, [revision]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    api.get(`/api/staff/receipts/deliveries?offset=${offset}`).then((data) => {
      if (!active) return;
      setRows((prev) => offset === 0 ? data.deliveries : [...prev, ...data.deliveries]);
      setHasMore(data.hasMore);
    }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, offset, revision]);
  return <section className={ui.history} aria-label="Historial de envíos">
    <h2>Historial de envíos</h2>
    <p className={ui.muted}>Registra los envíos realizados desde esta actualización. La aceptación del correo no confirma su lectura.</p>
    {error && <p role="alert" className={ui.errorText}>{error}</p>}
    {!loading && !error && !rows.length && <p>Aún no hay envíos registrados.</p>}
    <ul className={ui.list}>{rows.map((row) => <li className={ui.item} key={row._id}>
      <div className={ui.itemBody}><strong>{deliveryLabels[row.status]}</strong>
        <p className={ui.itemText}>{new Date(row.createdAt).toLocaleString("es-MX", { timeZone: "America/Tijuana" })} · hora de Tijuana</p>
        <p className={ui.itemText}>{row.sent} de {row.total} comprobantes · {row.emails} correos · {row.recipients.join(", ")}</p>
        <p className={ui.muted}>{row.periodLabel}</p>
        {row.error && <p className={ui.pending}>{row.error}</p>}
      </div>
    </li>)}</ul>
    {loading && <p role="status">Cargando envíos…</p>}
    {hasMore && !loading && <button type="button" className={ui.textButton} onClick={() => setOffset(rows.length)}>Cargar más envíos</button>}
  </section>;
}
