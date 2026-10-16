import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, History, Minus, Pencil, Plus, RefreshCw, Search, Trash2, Truck, X, ClipboardCheck } from "lucide-react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import {
  DISPOSABLE_CATEGORIES,
  disposableStatus,
  splitPieces,
} from "../../../backend/utils/disposables.js";
import dp from "./DisposablesPanel.module.css";

// Conteo de desechables (bowls, tapas, vasos, bolsas…) en paquetes y piezas.
// A propósito no muestra ni pide precios: el costo de compra vive en
// Inventario/Finanzas. La existencia solo cambia por recibir, sacar o contar,
// y cada cambio queda en la bitácora del artículo.

const STATUS = {
  ok:  { label: "Bien",    cls: "badgeGreen" },
  low: { label: "Bajo",    cls: "badgeYellow" },
  out: { label: "Agotado", cls: "badgeRed" },
};

const MOVEMENT_LABELS = { create: "Alta", receive: "Recepción", use: "Salida", count: "Conteo físico" };

const EMPTY_ITEM = { name: "", category: "Contenedores", piecesPerPack: "", minPacks: "", packs: "", pieces: "" };

const newRequestId = () => `disp-${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2, 12)}`;

const plural = (n, one, many) => `${n.toLocaleString("es-MX")} ${n === 1 ? one : many}`;

function formatStock(item) {
  const { packs, pieces } = splitPieces(item.pieces, item.piecesPerPack);
  if (packs === 0) return plural(pieces, "pieza", "piezas");
  if (pieces === 0) return plural(packs, "paquete", "paquetes");
  return `${plural(packs, "paquete", "paquetes")} + ${plural(pieces, "pieza", "piezas")}`;
}

const toInt = (value) => {
  const n = Number(value === "" ? 0 : value);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

export default function DisposablesPanel({ styles, ui }) {
  const { staffToken } = useContext(StaffAuthContext);
  const api = useMemo(() => createStaffApi(staffToken), [staffToken]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);

  // Diálogo de alta/edición del artículo.
  const itemDialog = useRef(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [editingId, setEditingId] = useState(null);
  const [itemOpen, setItemOpen] = useState(false);

  // Diálogo de movimiento: recibir, sacar o contar.
  const moveDialog = useRef(null);
  const [move, setMove] = useState(null); // { type, item, packs, pieces, requestId }

  const historyDialog = useRef(null);
  const [historyItem, setHistoryItem] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true);
    return api.get("/api/staff/disposables")
      .then((data) => { setItems(data.items ?? []); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (itemOpen) itemDialog.current?.showModal();
    else itemDialog.current?.close();
  }, [itemOpen]);

  useEffect(() => {
    if (move) moveDialog.current?.showModal();
    else moveDialog.current?.close();
  }, [move]);

  useEffect(() => {
    if (!historyItem) return undefined;
    let active = true;
    historyDialog.current?.showModal();
    setHistory([]);
    setHistoryLoading(true);
    api.get(`/api/staff/disposables/${historyItem._id}/movements`)
      .then((data) => { if (active) setHistory(data.movements || []); })
      .catch((e) => { if (active) setDialogError(e.message); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [api, historyItem]);

  const replaceItem = (updated) =>
    setItems((previous) => previous.map((item) => (item._id === updated._id ? updated : item)));

  const visible = items.filter((item) =>
    item.name.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))
    && (!onlyLow || disposableStatus(item) !== "ok"));
  const groups = DISPOSABLE_CATEGORIES
    .map((category) => ({ category, items: visible.filter((item) => item.category === category) }))
    .filter((group) => group.items.length > 0);
  const lowCount = items.filter((item) => disposableStatus(item) !== "ok").length;

  /* ── alta / edición ── */
  const openCreate = () => {
    setDialogError("");
    setEditingId(null);
    setItemForm(EMPTY_ITEM);
    setItemOpen(true);
  };

  const openEdit = (item) => {
    setDialogError("");
    setEditingId(item._id);
    setItemForm({
      name: item.name,
      category: item.category,
      piecesPerPack: String(item.piecesPerPack),
      minPacks: String(item.minPacks ?? 0),
      packs: "",
      pieces: "",
    });
    setItemOpen(true);
  };

  const formPiecesPerPack = toInt(itemForm.piecesPerPack);
  const formInitialPieces = Number.isFinite(formPiecesPerPack)
    ? toInt(itemForm.packs) * formPiecesPerPack + toInt(itemForm.pieces)
    : NaN;

  const saveItem = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setDialogError("");
    try {
      const fields = {
        name: itemForm.name,
        category: itemForm.category,
        piecesPerPack: Number(itemForm.piecesPerPack),
        minPacks: itemForm.minPacks === "" ? 0 : Number(itemForm.minPacks),
      };
      if (editingId) {
        const { item } = await api.patch(`/api/staff/disposables/${editingId}`, fields);
        replaceItem(item);
        setNotice(`Se guardaron los cambios de ${item.name}.`);
      } else {
        const { item } = await api.post("/api/staff/disposables", {
          ...fields,
          packs: itemForm.packs === "" ? 0 : Number(itemForm.packs),
          pieces: itemForm.pieces === "" ? 0 : Number(itemForm.pieces),
        });
        setItems((previous) => [...previous, item]);
        setNotice(`${item.name} se agregó a desechables.`);
      }
      setItemOpen(false);
    } catch (e) {
      setDialogError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (item) => {
    if (!window.confirm(`¿Eliminar "${item.name}" de desechables?`)) return;
    try {
      await api.delete(`/api/staff/disposables/${item._id}`);
      setItems((previous) => previous.filter((row) => row._id !== item._id));
      setNotice(`${item.name} se eliminó.`);
    } catch (e) {
      setError(e.message);
    }
  };

  /* ── recibir / sacar / contar ── */
  const openMove = (type, item) => {
    setDialogError("");
    const current = splitPieces(item.pieces, item.piecesPerPack);
    setMove({
      type,
      item,
      // El conteo arranca con lo que dice el sistema para solo corregir.
      packs: type === "count" ? String(current.packs) : "",
      pieces: type === "count" ? String(current.pieces) : "",
      requestId: newRequestId(),
    });
  };

  const moveTotal = move
    ? toInt(move.packs) * move.item.piecesPerPack + toInt(move.pieces)
    : 0;

  const updateMove = (field, value) =>
    // Cambiar la cantidad es otra operación: folio nuevo para que un
    // reintento de la anterior no se confunda con esta.
    setMove((previous) => ({ ...previous, [field]: value, requestId: newRequestId() }));

  const saveMove = async (event) => {
    event.preventDefault();
    if (saving || !move) return;
    setSaving(true);
    setDialogError("");
    const body = {
      packs: move.packs === "" ? 0 : Number(move.packs),
      pieces: move.pieces === "" ? 0 : Number(move.pieces),
    };
    try {
      const path = `/api/staff/disposables/${move.item._id}/${move.type}`;
      const { item } = await api.post(path, move.type === "count"
        ? { ...body, expectedPieces: move.item.pieces }
        : { ...body, requestId: move.requestId });
      replaceItem(item);
      setNotice(
        move.type === "receive" ? `Se sumaron ${plural(moveTotal, "pieza", "piezas")} a ${item.name}.`
          : move.type === "use" ? `Se sacaron ${plural(moveTotal, "pieza", "piezas")} de ${item.name}.`
            : `Conteo guardado: ${item.name} tiene ${formatStock(item)}.`
      );
      setMove(null);
    } catch (e) {
      setDialogError(e.message);
      if (e.status === 409) load(true);
    } finally {
      setSaving(false);
    }
  };

  const moveCopy = move && {
    receive: { title: "Recibir", hint: "¿Cuánto llegó? Se suma a lo que ya hay.", action: "Sumar" },
    use: { title: "Sacar", hint: "¿Cuánto se usó, se rompió o se tiró? Se resta de lo que hay.", action: "Restar" },
    count: { title: "Contar", hint: "Captura lo que hay físicamente. Reemplaza la existencia del sistema.", action: "Guardar conteo" },
  }[move.type];
  const moveInvalid = !move || !Number.isFinite(moveTotal)
    || (move.type !== "count" && moveTotal <= 0)
    || (move.type === "use" && moveTotal > move.item.pieces);

  return (
    <div className={dp.panel}>
      {/* Alta / edición */}
      <dialog ref={itemDialog} className={ui.editDialog} onClose={() => setItemOpen(false)} aria-labelledby="disposable-item-title">
        <form onSubmit={saveItem}>
          <div className={ui.movementHeading}>
            <div><span className={ui.eyebrow}>{editingId ? "Editar desechable" : "Nuevo desechable"}</span><h2 id="disposable-item-title">{itemForm.name || "Sin nombre"}</h2></div>
            <button type="button" title="Cerrar" aria-label="Cerrar" onClick={() => setItemOpen(false)} disabled={saving}><X size={20} /></button>
          </div>
          <div className={ui.editBody}>
            {dialogError && <p className={ui.errorNotice} role="alert">{dialogError}</p>}
            <div className={ui.editGrid}>
              <label className={ui.fullWidth}>Nombre<input required maxLength={80} placeholder="ej. Bowl 32 oz con tapa" value={itemForm.name} onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))} /></label>
              <label>Categoría<select value={itemForm.category} onChange={(e) => setItemForm((p) => ({ ...p, category: e.target.value }))}>{DISPOSABLE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label>Piezas por paquete<input type="number" min="1" step="1" required inputMode="numeric" placeholder="ej. 50" value={itemForm.piecesPerPack} onChange={(e) => setItemForm((p) => ({ ...p, piecesPerPack: e.target.value }))} /></label>
              <label className={ui.fullWidth}>Avisar cuando queden (paquetes)<input type="number" min="0" step="any" inputMode="decimal" placeholder="ej. 2" value={itemForm.minPacks} onChange={(e) => setItemForm((p) => ({ ...p, minPacks: e.target.value }))} /></label>
              {!editingId && (
                <>
                  <label>Existencia: paquetes completos<input type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={itemForm.packs} onChange={(e) => setItemForm((p) => ({ ...p, packs: e.target.value }))} /></label>
                  <label>+ piezas sueltas<input type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={itemForm.pieces} onChange={(e) => setItemForm((p) => ({ ...p, pieces: e.target.value }))} /></label>
                  <p className={`${ui.fullWidth} ${dp.preview}`}>
                    {Number.isFinite(formInitialPieces) ? `Total: ${plural(formInitialPieces, "pieza", "piezas")}` : "Usa números enteros."}
                  </p>
                </>
              )}
              {editingId && <p className={`${ui.fullWidth} ${dp.preview}`}>La existencia se cambia con Recibir, Sacar o Contar, para que quede en el historial.</p>}
            </div>
          </div>
          <div className={ui.dialogActions}>
            <button type="button" className={styles.btnGhost} onClick={() => setItemOpen(false)} disabled={saving}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={saving || (!editingId && !Number.isFinite(formInitialPieces))}>{saving ? "Guardando…" : editingId ? "Guardar cambios" : "Agregar"}</button>
          </div>
        </form>
      </dialog>

      {/* Recibir / sacar / contar */}
      <dialog ref={moveDialog} className={ui.editDialog} onClose={() => setMove(null)} aria-labelledby="disposable-move-title">
        {move && (
          <form onSubmit={saveMove}>
            <div className={ui.movementHeading}>
              <div><span className={ui.eyebrow}>{moveCopy.title}</span><h2 id="disposable-move-title">{move.item.name}</h2></div>
              <button type="button" title="Cerrar" aria-label="Cerrar" onClick={() => setMove(null)} disabled={saving}><X size={20} /></button>
            </div>
            <div className={ui.editBody}>
              {dialogError && <p className={ui.errorNotice} role="alert">{dialogError}</p>}
              <p className={dp.moveHint}>{moveCopy.hint} <span>1 paquete = {plural(move.item.piecesPerPack, "pieza", "piezas")}.</span></p>
              <div className={ui.editGrid}>
                <label>Paquetes<input type="number" min="0" step="1" inputMode="numeric" placeholder="0" autoFocus value={move.packs} onChange={(e) => updateMove("packs", e.target.value)} /></label>
                <label>Piezas sueltas<input type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={move.pieces} onChange={(e) => updateMove("pieces", e.target.value)} /></label>
              </div>
              <p className={dp.preview} role="status">
                {!Number.isFinite(moveTotal) ? "Usa números enteros."
                  : move.type === "count" ? `Quedará en ${plural(moveTotal, "pieza", "piezas")} (antes ${plural(move.item.pieces, "pieza", "piezas")}).`
                    : move.type === "use" && moveTotal > move.item.pieces ? `Solo hay ${plural(move.item.pieces, "pieza", "piezas")}. Si no cuadra, haz un conteo.`
                      : `${move.type === "receive" ? "Se suman" : "Se restan"} ${plural(moveTotal, "pieza", "piezas")}: queda en ${plural(move.item.pieces + (move.type === "receive" ? moveTotal : -moveTotal), "pieza", "piezas")}.`}
              </p>
            </div>
            <div className={ui.dialogActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setMove(null)} disabled={saving}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving || moveInvalid}>{saving ? "Guardando…" : moveCopy.action}</button>
            </div>
          </form>
        )}
      </dialog>

      {/* Historial */}
      <dialog ref={historyDialog} className={ui.movementDialog} onClose={() => setHistoryItem(null)} aria-labelledby="disposable-history-title">
        <div className={ui.movementHeading}>
          <h2 id="disposable-history-title">Movimientos: {historyItem?.name}</h2>
          <button type="button" aria-label="Cerrar movimientos" title="Cerrar" onClick={() => historyDialog.current.close()}><X size={18} /></button>
        </div>
        {historyLoading ? <p>Cargando movimientos…</p> : history.length === 0 ? <p>Sin movimientos registrados.</p> : (
          <div className={ui.movementTableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Fecha</th><th>Movimiento</th><th>Cambio</th><th>Existencia</th></tr></thead>
              <tbody>{history.map((m) => (
                <tr key={m._id}>
                  <td>{new Date(m.createdAt).toLocaleString("es-MX")}</td>
                  <td>{MOVEMENT_LABELS[m.type] || m.type}<small>{m.actorName}</small>{m.note && <small>{m.note}</small>}</td>
                  <td>{m.delta > 0 ? "+" : ""}{m.delta.toLocaleString("es-MX")} pzas</td>
                  <td>{m.piecesBefore.toLocaleString("es-MX")} → {m.piecesAfter.toLocaleString("es-MX")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </dialog>

      <header className={ui.pageHeader}>
        <div className={ui.pageIdentity}>
          <span className={ui.pageIcon}><Boxes size={24} /></span>
          <div><span className={ui.eyebrow}>Conteo por paquete y pieza · sin precios</span><h1>Desechables</h1></div>
        </div>
        <div className={ui.headerActions}>
          <button className={styles.btnGhost} onClick={() => load()} disabled={loading} title="Actualizar" aria-label="Actualizar desechables"><RefreshCw size={17} /></button>
          <button className={styles.btnPrimary} onClick={openCreate}><Plus size={17} />Nuevo desechable</button>
        </div>
      </header>

      {notice && (
        <div className={ui.successNotice} role="status">
          <span>✓</span>{notice}
          <button type="button" onClick={() => setNotice("")} aria-label="Cerrar notificación">×</button>
        </div>
      )}
      {error && <p className={ui.errorNotice} role="alert">{error}</p>}

      <div className={dp.toolbar}>
        <label className={dp.search}>
          <Search size={16} aria-hidden="true" />
          <input type="search" placeholder="Buscar desechable…" aria-label="Buscar desechable" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button type="button" className={`${dp.lowToggle} ${onlyLow ? dp.lowToggleOn : ""}`} aria-pressed={onlyLow} onClick={() => setOnlyLow((v) => !v)}>
          Por surtir <strong>{lowCount}</strong>
        </button>
      </div>

      {loading ? (
        <p className={dp.empty}>Cargando…</p>
      ) : items.length === 0 ? (
        <div className={ui.emptyState}>
          <span><Boxes size={28} /></span>
          <strong>Aún no hay desechables</strong>
          <p>Agrega bowls, tapas, vasos o bolsas con cuántas piezas trae cada paquete.</p>
          <button type="button" className={`${styles.btnPrimary} ${dp.inlineButton}`} onClick={openCreate}><Plus size={16} />Nuevo desechable</button>
        </div>
      ) : groups.length === 0 ? (
        <p className={dp.empty}>No hay desechables con ese filtro.</p>
      ) : groups.map((group) => (
        <section key={group.category} className={dp.group} aria-label={group.category}>
          <h2>{group.category}</h2>
          <ul className={dp.list}>
            {group.items.map((item) => {
              const status = STATUS[disposableStatus(item)];
              return (
                <li key={item._id} className={dp.row}>
                  <div className={dp.identity}>
                    <strong>{item.name}</strong>
                    <small>1 paquete = {plural(item.piecesPerPack, "pieza", "piezas")}{item.minPacks > 0 ? ` · avisar con ${item.minPacks} paq.` : ""}</small>
                  </div>
                  <div className={dp.stock}>
                    <strong>{formatStock(item)}</strong>
                    <small>{plural(item.pieces, "pieza", "piezas")} en total</small>
                  </div>
                  <span className={`${styles.badge} ${styles[status.cls]} ${dp.badge}`}>{status.label}</span>
                  <div className={dp.actions}>
                    <button type="button" className={styles.btnGhost} onClick={() => openMove("receive", item)}><Truck size={15} />Recibir</button>
                    <button type="button" className={styles.btnGhost} onClick={() => openMove("use", item)} disabled={item.pieces === 0}><Minus size={15} />Sacar</button>
                    <button type="button" className={styles.btnGhost} onClick={() => openMove("count", item)}><ClipboardCheck size={15} />Contar</button>
                    <button type="button" className={dp.iconButton} onClick={() => openEdit(item)} title="Editar" aria-label={`Editar ${item.name}`}><Pencil size={15} /></button>
                    <button type="button" className={dp.iconButton} onClick={() => { setDialogError(""); setHistoryItem(item); }} title="Movimientos" aria-label={`Movimientos de ${item.name}`}><History size={15} /></button>
                    <button type="button" className={`${dp.iconButton} ${dp.danger}`} onClick={() => removeItem(item)} title="Eliminar" aria-label={`Eliminar ${item.name}`}><Trash2 size={15} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
