import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock, List, Pencil, Plus, RefreshCw, Search, Trash2, Users, X } from "lucide-react";
import { StaffAuthContext } from "../../context/StaffAuthContext";
import { createStaffApi } from "../api";
import { tijuanaDateKey } from "../../utils/date";
import { CALENDAR_KINDS, absenceConflicts, canComplete, canEdit, formatDay, isManager, isTask, matchesCalendarFilters, monthDays, shiftDay, shiftMonth, spansDay } from "../../utils/teamCalendar";
import styles from "./TeamCalendarPage.module.css";

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const requestId = () => `calendar:${globalThis.crypto?.randomUUID?.() || `${Date.now()}:${Math.random().toString(36).slice(2)}`}`;
const dateRange = (entry) => entry.startDate === entry.endDate ? formatDay(entry.startDate)
  : `${formatDay(entry.startDate)} – ${formatDay(entry.endDate)}`;
const timeRange = (entry) => entry.startTime ? `${entry.startTime}${entry.endTime ? ` – ${entry.endTime}` : ""}` : "Todo el día";
const pathForMonth = (base, month) => {
  const days = monthDays(month);
  return `${base}&from=${days[0] < "2000-01-01" ? "2000-01-01" : days[0]}&to=${days[41] > "2100-12-31" ? "2100-12-31" : days[41]}`;
};

function Dialog({ title, children, onClose, busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="calendar-dialog-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className={styles.dialogHeading}><h2 id="calendar-dialog-title">{title}</h2>
      <button type="button" className={styles.iconButton} onClick={onClose} disabled={busy} aria-label="Cerrar"><X size={20} /></button>
    </div>{children}
  </dialog>;
}

function EventCard({ entry, onOpen, today, absences, highlighted = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!highlighted) return;
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [highlighted]);
  const kind = CALENDAR_KINDS[entry.type];
  const overdue = isTask(entry) && entry.status !== "done" && entry.endDate < today;
  const conflict = absenceConflicts(entry, absences).length > 0;
  return <button ref={ref} type="button" onClick={() => onOpen(entry)} className={`${styles.eventCard} ${entry.status === "done" ? styles.completed : ""} ${highlighted ? styles.savedEvent : ""}`}
    style={{ "--event-color": kind.color }}>
    <span className={styles.cardTop}><span className={styles.kind}>{kind.label}</span>
      {highlighted && <span className={styles.savedLabel}>Guardado</span>}
      {entry.priority === "high" && <span className={styles.priority}>Prioridad alta</span>}
      {entry.status === "done" && <CheckCircle2 size={16} aria-label="Completado" />}
    </span>
    <strong>{entry.title}</strong>
    <span className={styles.eventMeta}><Users size={13} /> {entry.assigneeName}</span>
    <span className={styles.eventMeta}><Clock size={13} /> {dateRange(entry)} · {timeRange(entry)}</span>
    {entry.type === "absence" && <span className={styles.returnDate}>Regreso: {formatDay(shiftDay(entry.endDate, 1), { weekday: "short", day: "numeric", month: "short" })}</span>}
    {overdue && <span className={styles.warningText}>Pendiente vencido</span>}
    {conflict && <span className={styles.warningText}><AlertTriangle size={13} /> Coincide con una ausencia del responsable</span>}
  </button>;
}

function EventForm({ entry, date, initialType = "task", people, user, busy, error, onSave, onClose }) {
  const [form, setForm] = useState(() => entry ? {
    title: entry.title, description: entry.description, type: entry.type,
    startDate: entry.startDate, endDate: entry.endDate, startTime: entry.startTime,
    endTime: entry.endTime, assigneeId: String(entry.assigneeId), priority: entry.priority, status: entry.status,
  } : { title: initialType === "absence" ? "Ausencia" : "", description: "", type: initialType, startDate: date, endDate: date,
    startTime: "", endTime: "", assigneeId: String(user.id), priority: "normal", status: "pending" });
  const [localError, setLocalError] = useState("");
  const [clientRequestId] = useState(requestId);
  const field = (name) => (event) => {
    const value = event.target.value;
    setLocalError("");
    setForm((previous) => {
      const next = { ...previous, [name === "returnDate" ? "endDate" : name]: name === "returnDate" && value ? shiftDay(value, -1) : value };
      if (name === "startDate" && next.endDate < value) next.endDate = value;
      if (name === "type") {
        if (value === "absence") {
          next.startTime = ""; next.endTime = "";
          if (!next.title.trim()) next.title = "Ausencia";
          if (!isManager(user)) next.assigneeId = String(user.id);
        }
        if (!["task", "maintenance"].includes(value)) next.status = "pending";
      }
      return next;
    });
  };
  const submit = (event) => {
    event.preventDefault();
    if (!form.title.trim()) return setLocalError("Escribe un título para el evento.");
    if (form.endDate < form.startDate) return setLocalError(form.type === "absence" ? "El regreso debe ser posterior al primer día de ausencia." : "Revisa el periodo del evento.");
    if (form.endTime && !form.startTime) return setLocalError("Indica la hora inicial.");
    if (form.startDate === form.endDate && form.endTime && form.endTime <= form.startTime) {
      return setLocalError("La hora final debe ser posterior a la inicial.");
    }
    onSave({ ...form, title: form.title.trim(), ...(entry ? { version: entry.__v } : { clientRequestId }) });
  };
  const options = [...people];
  if (entry && !options.some((person) => String(person._id) === String(entry.assigneeId))) {
    options.push({ _id: entry.assigneeId, name: `${entry.assigneeName} (inactivo)` });
  }
  const absenceDays = form.startDate && form.endDate ? Math.round((Date.parse(form.endDate) - Date.parse(form.startDate)) / 86400000) + 1 : 0;
  return <Dialog title={entry ? "Editar evento" : initialType === "absence" ? "Avisar ausencia" : "Nuevo evento"} onClose={onClose} busy={busy}>
    <form onSubmit={submit} className={styles.form}>
      <fieldset disabled={busy}>
        <label>Tipo<select aria-label="Tipo de evento" value={form.type} onChange={field("type")}>
          {Object.entries(CALENDAR_KINDS).map(([key, kind]) => <option key={key} value={key}>{kind.label}</option>)}
        </select></label>
        <label>Título<input autoFocus={initialType !== "absence"} required maxLength={120} value={form.title} onChange={field("title")}
          placeholder={form.type === "absence" ? "Ej. Día personal" : "Ej. Revisar inventario de la semana"} /></label>
        <div className={styles.formRow}>
          <label>{form.type === "absence" ? "Primer día ausente" : "Desde"}<input autoFocus={initialType === "absence"} required type="date" min="2000-01-01" max="2100-12-31" value={form.startDate} onChange={field("startDate")} /></label>
          {form.type === "absence"
            ? <label>Fecha de regreso<input required type="date" min={form.startDate ? shiftDay(form.startDate, 1) : "2000-01-02"} max="2101-01-01" value={form.endDate ? shiftDay(form.endDate, 1) : ""} onChange={field("returnDate")} /></label>
            : <label>Hasta<input required type="date" min={form.startDate} max="2100-12-31" value={form.endDate} onChange={field("endDate")} /></label>}
        </div>
        {form.type === "absence" && <div className={styles.absenceSummary} role="status">
          {absenceDays > 0 && <><strong>{absenceDays} día{absenceDays === 1 ? "" : "s"} de ausencia</strong><span>Del {formatDay(form.startDate)} al {formatDay(form.endDate)}, incluidos.</span></>}
          <small>El día de regreso ya no se marca como ausencia.</small>
        </div>}
        {form.type !== "absence" && <div className={styles.formRow}>
          <label>Hora inicial <small>(opcional)</small><input type="time" value={form.startTime} onChange={field("startTime")} /></label>
          <label>Hora final <small>(opcional)</small><input type="time" value={form.endTime} onChange={field("endTime")} /></label>
        </div>}
        <label>{form.type === "absence" ? "Quién se ausenta" : "Responsable"}
          <select aria-label={form.type === "absence" ? "Quién se ausenta" : "Responsable"} value={form.assigneeId} onChange={field("assigneeId")} required disabled={form.type === "absence" && !isManager(user)}>
            {options.map((person) => <option key={person._id} value={person._id}>{person.name}{String(person._id) === String(user.id) ? " (tú)" : ""}</option>)}
          </select>
        </label>
        {isTask(form) && <div className={styles.formRow}>
          <label>Prioridad<select value={form.priority} onChange={field("priority")}><option value="normal">Normal</option><option value="high">Alta</option></select></label>
          <label>Estado<select value={form.status} onChange={field("status")}><option value="pending">Pendiente</option><option value="done">Completado</option></select></label>
        </div>}
        <label>Detalles <small>(opcional · visibles para el equipo)</small><textarea rows={3} maxLength={2000}
          value={form.description} onChange={field("description")} placeholder="Instrucciones, acuerdos o información para organizar la cobertura" /></label>
      </fieldset>
      <p className={styles.hint}>Fechas y horarios de Tijuana. {form.type === "absence" ? "Las ausencias se registran por día completo." : "Deja las horas vacías si es un evento de todo el día."}</p>
      {(error || localError) && <p role="alert" className={styles.error}>{error || localError}</p>}
      <div className={styles.actions}><button type="button" onClick={onClose} disabled={busy} className={styles.secondary}>Cancelar</button>
        <button type="submit" disabled={busy} className={styles.primary}>{busy ? "Guardando…" : "Guardar evento"}</button></div>
    </form>
  </Dialog>;
}

export default function TeamCalendarPage({ locationId }) {
  const { staffToken, staffUser: user } = useContext(StaffAuthContext);
  const api = useMemo(() => createStaffApi(staffToken), [staffToken]);
  const [today, setToday] = useState(tijuanaDateKey);
  const [month, setMonth] = useState(() => `${tijuanaDateKey().slice(0, 7)}-01`);
  const [selectedDay, setSelectedDay] = useState(tijuanaDateKey);
  const [view, setView] = useState(() => window.matchMedia("(max-width: 640px)").matches ? "agenda" : "month");
  const [filters, setFilters] = useState({ type: "", person: "", search: "", showDone: false });
  const [data, setData] = useState({ key: "", events: [], people: [], overdue: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [savedEventId, setSavedEventId] = useState(null);
  const [agendaDayToReveal, setAgendaDayToReveal] = useState(null);
  const agendaRef = useRef(null);
  const requestSequence = useRef(0);
  const days = useMemo(() => monthDays(month), [month]);
  const base = `/api/staff/calendar?locationId=${encodeURIComponent(locationId)}`;
  const path = pathForMonth(base, month);

  const load = useCallback(async (showLoading = false) => {
    const sequence = ++requestSequence.current;
    if (showLoading) setLoading(true);
    try {
      const result = await api.get(path);
      if (sequence !== requestSequence.current) return;
      setData({ ...result, key: path });
      setLoadError("");
    } catch (error) {
      if (sequence === requestSequence.current) setLoadError(error.message);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [api, path]);

  useEffect(() => {
    load(true);
    const refresh = () => { if (!document.hidden) { setToday(tijuanaDateKey()); load(); } };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { ++requestSequence.current; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  const current = data.key === path;
  const events = useMemo(() => current ? data.events : [], [current, data.events]);
  const visible = useMemo(() => events.filter((entry) => matchesCalendarFilters(entry, filters)), [events, filters]);
  const allMonthEvents = events.filter((entry) => entry.startDate < shiftMonth(month, 1) && entry.endDate >= month);
  const monthEvents = allMonthEvents.filter((entry) => matchesCalendarFilters(entry, filters));
  const agendaGroups = new Map();
  for (const entry of monthEvents) {
    const day = entry.startDate < month ? month : entry.startDate;
    if (!agendaGroups.has(day)) agendaGroups.set(day, []);
    agendaGroups.get(day).push(entry);
  }
  const dayEvents = visible.filter((entry) => spansDay(entry, selectedDay));
  const overdue = data.overdue.filter((entry) => matchesCalendarFilters(entry, filters));
  const absences = events.filter((entry) => entry.type === "absence");
  const pending = allMonthEvents.filter((entry) => isTask(entry) && entry.status === "pending").length;
  const updateFilter = (key, value) => setFilters((previous) => ({ ...previous, [key]: value }));
  const hasFilters = Boolean(filters.type || filters.person || filters.search.trim() || filters.showDone);
  const clearFilters = () => setFilters({ type: "", person: "", search: "", showDone: false });

  useEffect(() => {
    if (!current || view !== "agenda" || !agendaDayToReveal) return;
    const groups = [...(agendaRef.current?.querySelectorAll("[data-agenda-day]") || [])];
    const target = groups.find((group) => group.dataset.agendaDay >= agendaDayToReveal) || groups.at(-1);
    target?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setAgendaDayToReveal(null);
  }, [current, view, agendaDayToReveal]);

  function openModal(next) { setSavedEventId(null); setMutationError(""); setModal(next); }
  function closeModal() { if (!busy) { setModal(null); setMutationError(""); } }
  function navigateMonth(offset) {
    const next = shiftMonth(month, offset);
    if (next < "2000-01-01" || next > "2100-12-01") return;
    setSavedEventId(null);
    setMonth(next); setSelectedDay(next);
  }
  async function mutate(operation, message, focusSavedEvent = false) {
    if (busy) return;
    setBusy(true); setMutationError(""); setNotice("");
    try {
      const result = await operation();
      setModal(null); setNotice(message);
      if (focusSavedEvent && result?.event) {
        const saved = result.event;
        setSavedEventId(saved._id);
        const nextMonth = `${saved.startDate.slice(0, 7)}-01`;
        const nextDays = monthDays(nextMonth);
        // A pending refresh must not replace the event just returned by POST/PATCH.
        ++requestSequence.current;
        setSelectedDay(saved.startDate);
        setFilters((previous) => ({ type: "", person: "", search: "", showDone: previous.showDone || saved.status === "done" }));
        setData((previous) => ({ ...previous, key: pathForMonth(base, nextMonth),
          events: [...previous.events.filter((entry) => entry._id !== saved._id
            && entry.startDate <= nextDays[41] && entry.endDate >= nextDays[0]), saved]
            .sort((left, right) => `${left.startDate} ${left.startTime}`.localeCompare(`${right.startDate} ${right.startTime}`)),
        }));
        setNotice(`${message} ${dateRange(saved)}.`);
        if (nextMonth !== month) {
          // The month effect fetches the new range; don't reload the old month.
          setMonth(nextMonth);
          return;
        }
      }
      await load();
    } catch (error) {
      setMutationError(error.message);
      if (error.status === 409 || error.status === 404) await load();
    }
    finally { setBusy(false); }
  }
  const save = (body) => mutate(() => modal.entry
    ? api.patch(`/api/staff/calendar/${modal.entry._id}?locationId=${encodeURIComponent(locationId)}`, body)
    : api.post(base, body), modal.entry ? "Evento actualizado." : "Evento agregado al calendario del equipo.", true);
  const entryPath = (entry) => `/api/staff/calendar/${entry._id}?locationId=${encodeURIComponent(locationId)}`;
  const selected = modal?.entry;
  const cards = (entries, highlightSaved = true) => entries.map((entry) => <EventCard key={entry._id} entry={entry} today={today} absences={absences} highlighted={highlightSaved && entry._id === savedEventId}
    onOpen={(event) => openModal({ mode: "detail", entry: event })} />);

  return <section className={styles.page} aria-label="Calendario del equipo">
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}><span /> ESPACIO COMPARTIDO</span>
        <h1>Calendario del equipo</h1><p>Pendientes claros, ausencias a tiempo y un equipo coordinado.</p></div>
      <div className={styles.headerActions}>
        <button className={styles.secondary} onClick={() => openModal({ mode: "form", initialType: "absence" })} disabled={!current || loading || busy}><Users size={17} /> Avisar ausencia</button>
        <button className={styles.primary} onClick={() => openModal({ mode: "form" })} disabled={!current || loading || busy}><Plus size={18} /> Nuevo evento</button>
      </div>
    </div>
    <div className={styles.stats}>
      <div><ClipboardList /><span><strong>{current ? pending : "—"}</strong><small>Pendientes del mes</small></span></div>
      <div><Users /><span><strong>{current ? allMonthEvents.filter((entry) => entry.type === "absence").length : "—"}</strong><small>Avisos de ausencia del mes</small></span></div>
      <div><CalendarDays /><span><strong>{current ? allMonthEvents.filter((entry) => ["meeting", "maintenance"].includes(entry.type)).length : "—"}</strong><small>Reuniones y mantenimiento del mes</small></span></div>
    </div>
    <div className={styles.toolbar}>
      <div className={styles.monthNavigation}>
        <button className={styles.iconButton} onClick={() => navigateMonth(-1)} aria-label="Mes anterior"><ChevronLeft size={20} /></button>
        <h2 aria-live="polite">{formatDay(month, { month: "long", year: "numeric" })}</h2>
        <button className={styles.iconButton} onClick={() => navigateMonth(1)} aria-label="Mes siguiente"><ChevronRight size={20} /></button>
        <button className={styles.secondary} onClick={() => { const key = tijuanaDateKey(); setSavedEventId(null); setToday(key); setMonth(`${key.slice(0, 7)}-01`); setSelectedDay(key); if (view === "agenda") setAgendaDayToReveal(key); }}>Hoy</button>
      </div>
      <div className={styles.viewSwitch} role="group" aria-label="Vista del calendario">
        <button onClick={() => setView("month")} aria-pressed={view === "month"}><CalendarDays size={16} /> Mes</button>
        <button onClick={() => setView("agenda")} aria-pressed={view === "agenda"}><List size={16} /> Agenda</button>
        <button onClick={() => load(true)} disabled={loading || busy} aria-label="Actualizar calendario"><RefreshCw size={16} /></button>
      </div>
    </div>
    <div className={styles.filters}>
      <label className={styles.search}><Search size={16} /><input aria-label="Buscar eventos" placeholder="Buscar en el calendario…" value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} /></label>
      <select aria-label="Filtrar por tipo" value={filters.type} onChange={(event) => updateFilter("type", event.target.value)}><option value="">Todos los tipos</option>
        {Object.entries(CALENDAR_KINDS).map(([key, kind]) => <option value={key} key={key}>{kind.plural}</option>)}</select>
      <select aria-label="Filtrar por responsable" value={filters.person} onChange={(event) => updateFilter("person", event.target.value)}><option value="">Todo el equipo</option>
        {data.people.map((person) => <option key={person._id} value={person._id}>{person.name}{String(person._id) === String(user.id) ? " (tú)" : ""}</option>)}</select>
      <label className={styles.checkbox}><input type="checkbox" checked={filters.showDone} onChange={(event) => updateFilter("showDone", event.target.checked)} /> Ver completados</label>
      {hasFilters && <button type="button" className={styles.secondary} onClick={clearFilters}><X size={14} /> Limpiar filtros</button>}
    </div>
    <div className={styles.quickFilters} role="group" aria-label="Filtros rápidos">
      <button aria-pressed={filters.person === String(user.id)} onClick={() => updateFilter("person", filters.person === String(user.id) ? "" : String(user.id))}>Lo mío</button>
      <button aria-pressed={filters.type === "absence"} onClick={() => updateFilter("type", filters.type === "absence" ? "" : "absence")}>Ausencias</button>
      {current && <span>{monthEvents.length} de {allMonthEvents.length} eventos del mes visibles</span>}
    </div>
    <div aria-live="polite">{notice && <p className={styles.success}><Check size={16} /> {notice}</p>}</div>
    {loadError && <p className={styles.error} role="alert">{loadError} <button className={styles.textButton} onClick={() => load(true)}>Reintentar</button></p>}
    {current && (data.truncated || data.overdueTruncated) && <p className={styles.warningText}>Se muestran hasta 1,000 eventos por vista y 50 pendientes vencidos. Completa o reprograma los pendientes para consultar los siguientes.</p>}
    {current && overdue.length > 0 && <details className={styles.overdue}>
      <summary><AlertTriangle size={16} /> {overdue.length}{data.overdueTruncated ? "+" : ""} pendiente{overdue.length === 1 ? " vencido" : "s vencidos"} · revisar y reprogramar</summary>
      <div className={styles.agendaList}>{cards(overdue, false)}</div>
    </details>}
    {loading && !current ? <div className={styles.empty} role="status">Cargando calendario del equipo…</div>
      : current && <div className={`${styles.workspace} ${view === "agenda" ? styles.agendaWorkspace : ""}`} aria-busy={loading}>
        <div className={styles.calendarPanel}>
          {view === "month" ? <>
            <div className={styles.weekdays}>{DAYS.map((day) => <span key={day}>{day}</span>)}</div>
            <div className={styles.grid}>
              {days.map((day) => {
                const items = visible.filter((entry) => spansDay(entry, day));
                return <button key={day} className={`${styles.day} ${day.slice(0, 7) !== month.slice(0, 7) ? styles.outside : ""} ${day === selectedDay ? styles.selected : ""}`}
                  aria-pressed={day === selectedDay} aria-current={day === today ? "date" : undefined}
                  aria-label={`${formatDay(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${items.length} eventos${items.length ? `: ${items.slice(0, 3).map((entry) => `${CALENDAR_KINDS[entry.type].label}: ${entry.title}, ${entry.assigneeName}`).join("; ")}` : ""}`}
                  disabled={day < "2000-01-01" || day > "2100-12-31"} onClick={() => setSelectedDay(day)}>
                  <span className={`${styles.dayNumber} ${day === today ? styles.today : ""}`}>{Number(day.slice(-2))}</span>
                  <span className={styles.dayItems}>{items.slice(0, 3).map((entry) => <span key={entry._id}
                    className={`${styles.dayEvent} ${entry.status === "done" ? styles.completed : ""}`} style={{ "--event-color": CALENDAR_KINDS[entry.type].color }}>
                    <i /> <span title={`${CALENDAR_KINDS[entry.type].label}: ${entry.title} · ${entry.assigneeName}`}>
                      {entry.type === "absence" ? `Ausente: ${entry.assigneeName}` : `${entry.startTime ? `${entry.startTime} ` : ""}${entry.title}`}
                    </span>
                  </span>)}</span>
                  {items.length > 3 && <small className={styles.more}>+{items.length - 3} más</small>}
                </button>;
              })}
            </div>
            <div className={styles.legend}>{Object.entries(CALENDAR_KINDS).map(([key, kind]) => <span key={key}><i style={{ background: kind.color }} />{kind.plural}</span>)}</div>
          </> : <div ref={agendaRef} className={styles.agenda}><h3>Agenda de {formatDay(month, { month: "long", year: "numeric" })}</h3>
            {monthEvents.length ? [...agendaGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([day, entries]) =>
              <section className={styles.agendaGroup} key={day} data-agenda-day={day} aria-label={formatDay(day, { weekday: "long", day: "numeric", month: "long" })}>
                <h4><span>{formatDay(day, { weekday: "long", day: "numeric", month: "long" })}</span>{day === today && <small>Hoy</small>}</h4>
                <div className={styles.agendaList}>{cards(entries)}</div>
              </section>
            ) : <p className={styles.empty}>{hasFilters ? "No hay eventos con estos filtros. Prueba quitarlos para ver el resto del equipo." : "El mes está libre. Agrega el primer pendiente, reunión o ausencia."}</p>}
          </div>}
        </div>
        {view === "month" && <aside className={styles.dayPanel}>
          <span className={styles.eyebrow}>{formatDay(selectedDay, { weekday: "long" })}</span>
          <h2>{formatDay(selectedDay, { day: "numeric", month: "long" })}</h2>
          <p className={styles.hint}>{dayEvents.length} evento{dayEvents.length === 1 ? "" : "s"} para este día</p>
          <div className={styles.dayList}>{dayEvents.length ? cards(dayEvents) : <div className={styles.empty}><CalendarDays size={28} /><strong>{hasFilters ? "Sin coincidencias para este día" : "Un día por organizar"}</strong><span>{hasFilters ? "Quita los filtros para consultar todos los eventos del día." : "Agrega un pendiente, una ausencia o una reunión."}</span>{hasFilters && <button className={styles.secondary} onClick={clearFilters}>Ver todo el equipo</button>}</div>}</div>
          <button className={styles.secondary} disabled={busy} onClick={() => openModal({ mode: "form" })}><Plus size={16} /> Agregar para este día</button>
          <p className={styles.hint}>El calendario se actualiza cada minuto mientras está visible. Horario de Tijuana.</p>
        </aside>}
      </div>}

    {modal?.mode === "form" && <EventForm entry={selected} date={selectedDay} initialType={modal.initialType} people={data.people} user={user} busy={busy} error={mutationError} onSave={save} onClose={closeModal} />}
    {modal?.mode === "detail" && <Dialog title={selected.title} onClose={closeModal} busy={busy}>
      <div className={styles.detail}>
        <span className={styles.kind} style={{ "--event-color": CALENDAR_KINDS[selected.type].color }}>{CALENDAR_KINDS[selected.type].label}{selected.status === "done" ? " · Completado" : ""}</span>
        <p><CalendarDays size={17} /> {dateRange(selected)}</p><p><Clock size={17} /> {timeRange(selected)} · Tijuana</p>
        {selected.type === "absence" && <p className={styles.returnDate}>Regreso: {formatDay(shiftDay(selected.endDate, 1), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>}
        <p><Users size={17} /> {selected.assigneeName}</p>
        {selected.priority === "high" && <p className={styles.priority}>Prioridad alta</p>}
        {selected.description && <div className={styles.description}>{selected.description}</div>}
        {absenceConflicts(selected, absences).length > 0 && <p className={styles.warningText}><AlertTriangle size={16} /> El responsable tiene una ausencia en estas fechas. Revisa la cobertura o reprograma el pendiente.</p>}
        <small className={styles.hint}>Creado por {selected.createdByName}</small>
        {mutationError && <p role="alert" className={styles.error}>{mutationError}</p>}
        <div className={styles.actions}>
          {canEdit(user, selected) && <><button className={styles.danger} disabled={busy} onClick={() => openModal({ mode: "delete", entry: selected })}><Trash2 size={16} /> Eliminar</button>
            <button className={styles.secondary} disabled={busy} onClick={() => openModal({ mode: "form", entry: selected })}><Pencil size={16} /> Editar</button></>}
          {canComplete(user, selected) && <button className={styles.primary} disabled={busy} onClick={() => mutate(() => api.patch(entryPath(selected),
            { status: selected.status === "done" ? "pending" : "done", version: selected.__v }), selected.status === "done" ? "Pendiente reabierto." : "Pendiente completado.")}>
            <CheckCircle2 size={16} /> {busy ? "Guardando…" : selected.status === "done" ? "Reabrir" : "Completar"}</button>}
        </div>
      </div>
    </Dialog>}
    {modal?.mode === "delete" && <Dialog title="Eliminar evento" onClose={closeModal} busy={busy}>
      <div className={styles.detail}><p>Se eliminará “{selected.title}” del calendario de todo el equipo.</p>
        {mutationError && <p className={styles.error} role="alert">{mutationError}</p>}
        <div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={closeModal}>Cancelar</button>
          <button className={styles.danger} disabled={busy} onClick={() => mutate(() => api.delete(entryPath(selected), { version: selected.__v }), "Evento eliminado.")}>{busy ? "Eliminando…" : "Eliminar evento"}</button></div>
      </div>
    </Dialog>}
  </section>;
}
