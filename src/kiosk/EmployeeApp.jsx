import { useState, useEffect, useMemo } from "react";
import {
  Clock, LogIn, LogOut, CheckSquare, Thermometer, Calendar, Megaphone,
  ChevronLeft, Delete, Plus, AlertTriangle,
  Snowflake, Refrigerator, Flame, Download, Trash2, Leaf, ShieldCheck,
  User, TrendingUp,
} from "lucide-react";
import { API_URL } from "../config";
import { tijuanaDateKey } from "../utils/date";

const LOCATION_ID = "tij-centro-01";
const todayKey = () => tijuanaDateKey();
const fmtTime = (d) => new Date(d).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
const fmtHM = (mins) => `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, "0")}m`;
const initials = (name) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
const sid = (id) => String(id);

const COLORS = {
  emerald: { bg: "bg-emerald-500", ring: "ring-emerald-400", text: "text-emerald-400", light: "bg-emerald-500/20" },
  amber:   { bg: "bg-amber-500",   ring: "ring-amber-400",   text: "text-amber-400",   light: "bg-amber-500/20"   },
  sky:     { bg: "bg-sky-500",     ring: "ring-sky-400",     text: "text-sky-400",     light: "bg-sky-500/20"     },
  rose:    { bg: "bg-rose-500",    ring: "ring-rose-400",    text: "text-rose-400",    light: "bg-rose-500/20"    },
  violet:  { bg: "bg-violet-500",  ring: "ring-violet-400",  text: "text-violet-400",  light: "bg-violet-500/20"  },
  orange:  { bg: "bg-orange-500",  ring: "ring-orange-400",  text: "text-orange-400",  light: "bg-orange-500/20"  },
};
const getColor = (c) => COLORS[c] || COLORS.emerald;

const CHECKLISTS = {
  apertura: { label: "Apertura", icon: LogIn, color: "text-emerald-400", items: [
    "Lavado de manos y uniforme completo",
    "Encender luces, música y clima",
    "Encender POS, pantallas e impresora de tickets",
    "Revisar y registrar temperaturas de refris y barra fría",
    "Sacar preparaciones y rotular fecha/hora (FIFO)",
    "Montar barra: bases, proteínas, complementos y toppings",
    "Revisar stock de proteínas y salsas del día",
    "Limpiar y desinfectar barra, mesas y superficies",
    "Verificar apps de delivery (Uber/Didi/Rappi) activas",
  ]},
  cierre: { label: "Cierre", icon: LogOut, color: "text-rose-400", items: [
    "Pausar apps de delivery y POS",
    "Descartar producto vencido (registrar merma)",
    "Guardar, tapar y rotular sobrantes (FIFO)",
    "Limpiar y desinfectar barra fría y línea",
    "Lavar y sanitizar utensilios y tablas",
    "Trapear pisos y sacar basura",
    "Registrar temperaturas finales de refris",
    "Cuadrar caja y dejar fondo",
    "Apagar equipos no esenciales y luces",
  ]},
  limpieza: { label: "Limpieza", icon: ShieldCheck, color: "text-sky-400", items: [
    "Desinfectar interior de refrigeradores y congelador",
    "Limpiar filtros de campana / extractor",
    "Descongelar y limpiar congelador",
    "Limpiar coladeras y trampa de grasa",
    "Lavar tarjas y desinfectar drenajes",
    "Revisar caducidades de despensa seca",
    "Limpiar detrás y debajo de equipos",
  ]},
};
const CHECK_IDS = Object.keys(CHECKLISTS);

const TEMP_STATIONS = [
  { id: "refri-prot", label: "Refri proteínas",       icon: Refrigerator, min: 0,   max: 4,   unit: "°C", accent: "sky"     },
  { id: "barra-fria", label: "Barra fría",             icon: Snowflake,    min: 0,   max: 4,   unit: "°C", accent: "emerald" },
  { id: "congelador", label: "Congelador",             icon: Snowflake,    min: -30, max: -18, unit: "°C", accent: "violet"  },
  { id: "linea",      label: "Producto en línea",      icon: Flame,        min: 0,   max: 4,   unit: "°C", accent: "amber"   },
];

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/* ============================================================================
   MAIN APP
   ========================================================================== */
export default function EmployeeApp() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [time, setTime] = useState([]);
  const [checklist, setChecklist] = useState({});
  const [temps, setTemps] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [announcements, setAnnouncements] = useState([]);
  const [token, setToken] = useState(null);
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("inicio");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetch(`${API_URL}/api/kiosk/employees?locationId=${LOCATION_ID}`)
      .then((r) => r.json())
      .then((d) => { setEmployees(d.employees || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };
    const today = todayKey();
    Promise.all([
      fetch(`${API_URL}/api/kiosk/time?locationId=${LOCATION_ID}`, { headers: h }).then((r) => r.json()),
      fetch(`${API_URL}/api/kiosk/checklist?locationId=${LOCATION_ID}&date=${today}`, { headers: h }).then((r) => r.json()),
      fetch(`${API_URL}/api/kiosk/temps?locationId=${LOCATION_ID}`, { headers: h }).then((r) => r.json()),
      fetch(`${API_URL}/api/kiosk/schedule?locationId=${LOCATION_ID}`, { headers: h }).then((r) => r.json()),
      fetch(`${API_URL}/api/kiosk/announcements?locationId=${LOCATION_ID}`, { headers: h }).then((r) => r.json()),
    ]).then(([td, cd, pd, sd, ad]) => {
      setTime(td.records || []);
      setChecklist(cd.checklist || {});
      setTemps(pd.records || []);
      setSchedule(sd.schedule || {});
      setAnnouncements(ad.announcements || []);
    }).catch(console.error);
  }, [token]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const openEntry = useMemo(
    () => (me ? time.find((t) => sid(t.employeeId) === sid(me.id) && !t.clockOut) : null),
    [time, me]
  );
  const isManager = Boolean(me?.isManager);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {}),
    [token]
  );

  async function handleLogin(pin) {
    const r = await fetch(`${API_URL}/api/staff-auth/pin-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, locationId: LOCATION_ID }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.message || "PIN incorrecto");
    }
    const { token: t, user } = await r.json();
    setToken(t);
    setMe(user);
    if (user.isManager) {
      const managed = await fetch(
        `${API_URL}/api/kiosk/employees/manage?locationId=${LOCATION_ID}`,
        { headers: { Authorization: `Bearer ${t}` } }
      );
      if (managed.ok) {
        const data = await managed.json();
        setEmployees(data.employees || []);
      }
    }
    setTab("inicio");
  }

  function handleLogout() {
    setToken(null); setMe(null);
    setEmployees((current) => current.map(({ _id, name, color }) => ({ _id, name, color })));
    setTime([]); setChecklist({}); setTemps([]); setSchedule({}); setAnnouncements([]);
  }

  async function clockIn() {
    const r = await fetch(`${API_URL}/api/kiosk/time/clock-in`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ locationId: LOCATION_ID, date: todayKey() }),
    });
    const { record } = await r.json();
    if (record) setTime((p) => [record, ...p]);
  }

  async function clockOut() {
    const r = await fetch(`${API_URL}/api/kiosk/time/clock-out`, {
      method: "POST", headers: authHeaders, body: JSON.stringify({}),
    });
    const { record } = await r.json();
    if (record) setTime((p) => p.map((t) => sid(t._id) === sid(record._id) ? record : t));
  }

  async function toggleTask(listId, idx) {
    const currently = Boolean(checklist?.[listId]?.[String(idx)]);
    const r = await fetch(`${API_URL}/api/kiosk/checklist`, {
      method: "PATCH", headers: authHeaders,
      body: JSON.stringify({ locationId: LOCATION_ID, date: todayKey(), listId, idx, checked: !currently }),
    });
    const { items } = await r.json();
    if (items) setChecklist((p) => ({ ...p, [listId]: items }));
  }

  async function addTemp(stationId, value) {
    const r = await fetch(`${API_URL}/api/kiosk/temps`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ stationId, value: Number(value), date: todayKey(), locationId: LOCATION_ID }),
    });
    const { record } = await r.json();
    if (record) setTemps((p) => [record, ...p]);
  }

  async function addAnnouncement(text) {
    const r = await fetch(`${API_URL}/api/kiosk/announcements`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ text, locationId: LOCATION_ID }),
    });
    const { announcement } = await r.json();
    if (announcement) setAnnouncements((p) => [announcement, ...p]);
  }

  async function removeAnnouncement(id) {
    await fetch(`${API_URL}/api/kiosk/announcements/${id}`, { method: "DELETE", headers: authHeaders });
    setAnnouncements((p) => p.filter((a) => sid(a._id) !== sid(id)));
  }

  async function addEmployee(form) {
    const r = await fetch(`${API_URL}/api/kiosk/employees`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ ...form, locationId: LOCATION_ID }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.message || "Error al crear empleado");
    }
    const { employee } = await r.json();
    if (employee) setEmployees((p) => [...p, employee]);
  }

  async function removeEmployee(id) {
    await fetch(`${API_URL}/api/kiosk/employees/${id}`, {
      method: "DELETE", headers: authHeaders,
    });
    setEmployees((p) => p.filter((e) => sid(e._id) !== sid(id)));
  }

  async function saveSchedule(draft) {
    await fetch(`${API_URL}/api/kiosk/schedule`, {
      method: "PUT", headers: authHeaders,
      body: JSON.stringify({ locationId: LOCATION_ID, schedule: draft }),
    });
    setSchedule(draft);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-emerald-950">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <Leaf className="w-8 h-8 text-lime-400" />
        </div>
        <p className="text-emerald-300 text-sm tracking-widest uppercase">Cargando…</p>
      </div>
    </div>
  );

  if (!me) return <KioskLogin employees={employees} onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-white/5 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Leaf className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 leading-none">Poke Palace</p>
              <p className="text-sm font-bold leading-tight">{me.name}</p>
            </div>
            {openEntry && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                En turno
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono font-semibold text-slate-300 tabular-nums">
              {new Date(now).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition">
              <LogOut className="w-3.5 h-3.5" /> Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl w-full mx-auto px-4 py-5 pb-28">
        {tab === "inicio"  && <HomeTab me={me} now={now} openEntry={openEntry} time={time} schedule={schedule} checklist={checklist} onClockIn={clockIn} onClockOut={clockOut} />}
        {tab === "tareas"  && <TasksTab employees={employees} checklist={checklist} onToggle={toggleTask} />}
        {tab === "temp"    && <TempsTab employees={employees} temps={temps} onAdd={addTemp} />}
        {tab === "horario" && <ScheduleTab employees={employees} schedule={schedule} isManager={isManager} onSave={saveSchedule} />}
        {tab === "avisos"  && <AnnouncementsTab employees={employees} announcements={announcements} isManager={isManager} onAdd={addAnnouncement} onRemove={removeAnnouncement} />}
        {tab === "panel"   && isManager && <PanelTab employees={employees} time={time} now={now} onAddEmployee={addEmployee} onRemoveEmployee={removeEmployee} />}
      </main>

      <BottomNav tab={tab} setTab={setTab} isManager={isManager} openEntry={openEntry} />
    </div>
  );
}

/* ============================================================================
   KIOSK LOGIN
   ========================================================================== */
function KioskLogin({ employees, onLogin }) {
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function press(d) {
    if (busy || pin.length >= 4) return;
    setError(false);
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      setBusy(true);
      try { await onLogin(next); }
      catch { setError(true); setTimeout(() => { setPin(""); setBusy(false); }, 700); }
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* Top brand bar */}
      <div className="px-6 pt-10 pb-8 text-center relative">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/60 to-transparent" />
        <div className="relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-900/30">
            <Leaf className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Poke Palace</h1>
          <p className="text-emerald-400 text-xs uppercase tracking-[0.3em] mt-1">Registro de personal</p>
        </div>
      </div>

      {!selected ? (
        <div className="flex-1 px-5 max-w-2xl mx-auto w-full">
          <p className="text-slate-400 text-sm mb-5 text-center">Selecciona tu nombre para iniciar</p>
          <div className="grid grid-cols-2 gap-3">
            {employees.map((e) => {
              const col = getColor(e.color);
              return (
                <button key={sid(e._id)} onClick={() => { setSelected(e); setPin(""); setError(false); }}
                  className="group relative overflow-hidden flex items-center gap-4 bg-slate-900 hover:bg-slate-800 border border-white/5 hover:border-white/10 rounded-2xl p-4 text-left transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
                  <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity ${col.light}`} />
                  <div className={`relative w-14 h-14 rounded-xl ${col.bg} flex items-center justify-center font-bold text-white text-lg shadow-lg shrink-0`}>
                    {initials(e.name)}
                  </div>
                  <div className="relative min-w-0">
                    <p className="font-semibold text-white truncate">{e.name}</p>
                    <p className={`text-xs mt-0.5 ${col.text}`}>Personal</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 px-6 max-w-xs mx-auto w-full flex flex-col items-center">
          <button onClick={() => { setSelected(null); setPin(""); setError(false); setBusy(false); }}
            className="self-start flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-6 transition">
            <ChevronLeft className="w-4 h-4" /> Cambiar
          </button>

          {/* Avatar */}
          <div className={`w-20 h-20 rounded-2xl ${getColor(selected.color).bg} flex items-center justify-center font-bold text-white text-2xl mb-3 shadow-xl`}>
            {initials(selected.name)}
          </div>
          <p className="font-bold text-lg text-white mb-0.5">{selected.name}</p>
          <p className={`text-xs mb-5 ${getColor(selected.color).text}`}>Personal</p>

          {/* PIN dots */}
          <div className="flex gap-4 mb-8">
            {[0,1,2,3].map((i) => (
              <div key={i} className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
                error ? "bg-rose-500 border-rose-500 scale-110" :
                pin.length > i ? `${getColor(selected.color).bg} border-transparent scale-110` :
                "border-slate-600"
              }`} />
            ))}
          </div>
          {error && <p className="text-rose-400 text-xs mb-4 -mt-4">PIN incorrecto, intenta de nuevo</p>}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3 w-full">
            {[1,2,3,4,5,6,7,8,9].map((d) => (
              <PinKey key={d} onClick={() => press(String(d))}>{d}</PinKey>
            ))}
            <div />
            <PinKey onClick={() => press("0")}>0</PinKey>
            <PinKey ariaLabel="Borrar último dígito" onClick={() => { setError(false); setPin((p) => p.slice(0, -1)); }} subtle>
              <Delete className="w-5 h-5 mx-auto" />
            </PinKey>
          </div>
        </div>
      )}
    </div>
  );
}

function PinKey({ children, onClick, subtle, ariaLabel }) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel}
      className={`h-16 rounded-2xl text-xl font-semibold transition-all duration-100 active:scale-95 ${
        subtle
          ? "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
          : "bg-slate-800 hover:bg-slate-700 text-white border border-white/5"
      }`}>
      {children}
    </button>
  );
}

/* ============================================================================
   INICIO
   ========================================================================== */
function HomeTab({ me, now, openEntry, time, schedule, checklist, onClockIn, onClockOut }) {
  const [confirmOut, setConfirmOut] = useState(false);
  const todayEntries = time.filter((t) => sid(t.employeeId) === sid(me.id) && t.date === todayKey());
  const workedMins = todayEntries.reduce((acc, t) => {
    const start = new Date(t.clockIn).getTime();
    const end = t.clockOut ? new Date(t.clockOut).getTime() : (sid(t._id) === sid(openEntry?._id) ? now : start);
    return acc + (end - start) / 60000;
  }, 0);
  const myShift = schedule?.[sid(me.id)]?.[(new Date().getDay() + 6) % 7];
  const totalTasks = Object.values(CHECKLISTS).reduce((a, l) => a + l.items.length, 0);
  const doneTasks = CHECK_IDS.reduce((a, lid) => a + Object.keys(checklist?.[lid] || {}).length, 0);
  const taskPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Date greeting */}
      <div>
        <p className="text-slate-400 text-sm capitalize">
          {new Date(now).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h2 className="text-2xl font-black tracking-tight">¡Hola, {me.name.split(" ")[0]}!</h2>
      </div>

      {/* Clock card */}
      <div className={`relative overflow-hidden rounded-3xl p-6 ${openEntry ? "bg-emerald-600" : "bg-slate-800"} transition-colors duration-500`}>
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-black/10 translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <span className={`text-xs uppercase tracking-widest font-semibold ${openEntry ? "text-emerald-100" : "text-slate-400"}`}>
              {openEntry ? "Turno activo" : "Sin turno activo"}
            </span>
            {openEntry && (
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-200 bg-black/20 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-lime-300 animate-pulse" />
                desde {fmtTime(openEntry.clockIn)}
              </span>
            )}
          </div>

          <p className={`text-xs mb-1 ${openEntry ? "text-emerald-200" : "text-slate-500"}`}>Trabajado hoy</p>
          <p className="text-5xl font-black tabular-nums mb-6">{fmtHM(workedMins)}</p>

          {openEntry ? (
            confirmOut ? (
              <div className="space-y-2">
                <p className="text-sm text-center text-emerald-100 mb-3">¿Confirmas tu salida?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmOut(false)}
                    className="flex-1 bg-black/20 hover:bg-black/30 text-white font-semibold py-3.5 rounded-2xl transition text-sm">
                    Cancelar
                  </button>
                  <button onClick={() => { setConfirmOut(false); onClockOut(); }}
                    className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-bold py-3.5 rounded-2xl transition text-sm">
                    Sí, marcar salida
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmOut(true)}
                className="w-full flex items-center justify-center gap-2 bg-black/20 hover:bg-black/30 text-white font-bold py-4 rounded-2xl text-base transition active:scale-[0.98]">
                <LogOut className="w-5 h-5" /> Marcar salida
              </button>
            )
          ) : (
            <button onClick={onClockIn}
              className="w-full flex items-center justify-center gap-2 bg-lime-400 hover:bg-lime-300 text-slate-900 font-bold py-4 rounded-2xl text-base transition active:scale-[0.98] shadow-lg shadow-lime-900/30">
              <LogIn className="w-5 h-5" /> Marcar entrada
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800 rounded-2xl p-4 border border-white/5">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
            <Calendar className="w-3.5 h-3.5" /> Mi turno hoy
          </div>
          <p className="font-bold text-white">{myShift || "Sin asignar"}</p>
        </div>
        <div className="bg-slate-800 rounded-2xl p-4 border border-white/5">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
            <CheckSquare className="w-3.5 h-3.5" /> Tareas
          </div>
          <p className="font-bold text-white mb-2">{doneTasks}/{totalTasks}</p>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${taskPct}%` }} />
          </div>
        </div>
      </div>

      {/* Today entries */}
      {todayEntries.length > 0 && (
        <div className="bg-slate-800 rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-sm font-semibold text-slate-300">Registros de hoy</p>
          </div>
          <ul className="divide-y divide-white/5">
            {todayEntries.map((t) => (
              <li key={sid(t._id)} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-emerald-400">
                  <LogIn className="w-4 h-4" /> {fmtTime(t.clockIn)}
                </span>
                <span className="flex items-center gap-2 text-slate-400">
                  {t.clockOut
                    ? <><LogOut className="w-4 h-4 text-rose-400" />{fmtTime(t.clockOut)}</>
                    : <span className="text-emerald-400 animate-pulse">en curso…</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   TAREAS
   ========================================================================== */
function TasksTab({ employees, checklist, onToggle }) {
  const [active, setActive] = useState("apertura");
  const list = CHECKLISTS[active];
  const done = checklist?.[active] || {};
  const empName = (id) => employees.find((e) => sid(e._id) === sid(id))?.name.split(" ")[0] || "?";
  const completed = Object.keys(done).length;
  const pct = list.items.length > 0 ? Math.round((completed / list.items.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black tracking-tight">Tareas del día</h2>
        <p className="text-sm text-slate-400 mt-0.5">Registro de quién completó cada tarea y a qué hora.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        {CHECK_IDS.map((id) => {
          const L = CHECKLISTS[id];
          const Icon = L.icon;
          const isActive = active === id;
          return (
            <button key={id} onClick={() => setActive(id)}
              className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border text-xs font-semibold transition-all ${
                isActive
                  ? "bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-900/30"
                  : "bg-slate-800 text-slate-400 border-white/5 hover:border-white/10"
              }`}>
              <Icon className={`w-5 h-5 ${isActive ? "text-white" : L.color}`} />
              {L.label}
            </button>
          );
        })}
      </div>

      {/* Progress */}
      <div className="bg-slate-800 rounded-2xl border border-white/5 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">{list.label}</span>
          <span className="text-xs text-slate-400 tabular-nums">{completed}/{list.items.length} — {pct}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Task list */}
      <div className="bg-slate-800 rounded-2xl border border-white/5 overflow-hidden">
        <ul className="divide-y divide-white/5">
          {list.items.map((item, idx) => {
            const rec = done[String(idx)];
            return (
              <li key={idx} onClick={() => onToggle(active, idx)}
                className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-white/3 transition-colors active:bg-white/5">
                <span className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border-2 shrink-0 transition-all ${
                  rec ? "bg-emerald-500 border-emerald-500" : "border-slate-600"
                }`}>
                  {rec && <CheckSquare className="w-3.5 h-3.5 text-white" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`text-sm block ${rec ? "line-through text-slate-500" : "text-slate-200"}`}>{item}</span>
                  {rec && (
                    <span className="block text-[11px] text-emerald-500 mt-0.5">
                      ✓ {empName(rec.by)} · {fmtTime(rec.ts)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ============================================================================
   TEMPERATURAS
   ========================================================================== */
function TempsTab({ employees, temps, onAdd }) {
  const [vals, setVals] = useState({});
  const dk = todayKey();
  const empName = (id) => employees.find((e) => sid(e._id) === sid(id))?.name.split(" ")[0] || "?";

  function submit(st) {
    const v = vals[st.id];
    if (v === undefined || v === "") return;
    onAdd(st.id, v);
    setVals((p) => ({ ...p, [st.id]: "" }));
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black tracking-tight">Temperaturas</h2>
        <p className="text-sm text-slate-400 mt-0.5">Registra al abrir y al cerrar. Fuera de rango = alerta.</p>
      </div>

      {TEMP_STATIONS.map((st) => {
        const Icon = st.icon;
        const todays = temps.filter((t) => t.stationId === st.id && t.date === dk);
        const last = todays[0];
        const outOfRange = last && (last.value < st.min || last.value > st.max);
        const acCol = getColor(st.accent);
        return (
          <div key={st.id} className={`bg-slate-800 rounded-2xl border overflow-hidden transition-colors ${outOfRange ? "border-rose-500/40" : "border-white/5"}`}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className={`w-10 h-10 rounded-xl ${acCol.light} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${acCol.text}`} />
                  </span>
                  <div>
                    <p className="font-semibold text-sm text-white">{st.label}</p>
                    <p className="text-[11px] text-slate-500">Rango: {st.min} a {st.max}{st.unit}</p>
                  </div>
                </div>
                {last && (
                  <div className={`text-right ${outOfRange ? "text-rose-400" : "text-emerald-400"}`}>
                    <p className="text-2xl font-black tabular-nums">{last.value}{st.unit}</p>
                    <p className="text-[10px] text-slate-500">{fmtTime(last.ts)}</p>
                  </div>
                )}
              </div>

              {outOfRange && (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5 mb-4">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Fuera de rango. Avisa al gerente de inmediato.
                </div>
              )}

              <div className="flex gap-2">
                <input type="number" inputMode="decimal" placeholder={`Temperatura en ${st.unit}`}
                  value={vals[st.id] ?? ""}
                  onChange={(e) => setVals((p) => ({ ...p, [st.id]: e.target.value }))}
                  className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                <button onClick={() => submit(st)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-5 rounded-xl transition active:scale-95">
                  Registrar
                </button>
              </div>

              {todays.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {todays.map((t, i) => (
                    <span key={i} className="text-[11px] bg-slate-900 border border-white/5 rounded-lg px-2 py-1 text-slate-400">
                      {t.value}° · {fmtTime(t.ts)} · {empName(t.by)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================================
   HORARIO
   ========================================================================== */
function ScheduleTab({ employees, schedule, isManager, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(schedule);
  useEffect(() => setDraft(schedule), [schedule]);

  const todayIdx = (new Date().getDay() + 6) % 7;

  function setCell(empId, dayIdx, value) {
    setDraft((p) => ({ ...p, [empId]: { ...(p[empId] || {}), [dayIdx]: value } }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight">Horario semanal</h2>
          <p className="text-sm text-slate-400 mt-0.5">Turnos del equipo por día.</p>
        </div>
        {isManager && (
          editing ? (
            <div className="flex gap-2">
              <button onClick={() => { setDraft(schedule); setEditing(false); }}
                className="text-sm px-3 py-2 rounded-xl bg-slate-700 text-slate-300 hover:bg-slate-600 transition">Cancelar</button>
              <button onClick={() => { onSave(draft); setEditing(false); }}
                className="text-sm px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition">Guardar</button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)}
              className="text-sm px-4 py-2 rounded-xl bg-slate-700 text-white font-semibold hover:bg-slate-600 transition">Editar</button>
          )
        )}
      </div>

      <div className="overflow-x-auto bg-slate-800 rounded-2xl border border-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-4 py-3 font-medium text-slate-400 sticky left-0 bg-slate-800">Empleado</th>
              {DAYS.map((d, i) => (
                <th key={d} className={`px-3 py-3 font-medium text-center min-w-[56px] ${i === todayIdx ? "text-emerald-400" : "text-slate-400"}`}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {employees.map((e) => {
              const col = getColor(e.color);
              return (
                <tr key={sid(e._id)}>
                  <td className="px-4 py-3 sticky left-0 bg-slate-800">
                    <div className="flex items-center gap-2">
                      <span className={`w-7 h-7 rounded-lg ${col.bg} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>{initials(e.name)}</span>
                      <span className="font-medium text-white text-sm">{e.name.split(" ")[0]}</span>
                    </div>
                  </td>
                  {DAYS.map((_, di) => (
                    <td key={di} className={`px-1 py-2 text-center ${di === todayIdx ? "bg-emerald-900/20" : ""}`}>
                      {editing ? (
                        <input value={draft?.[sid(e._id)]?.[di] || ""}
                          onChange={(ev) => setCell(sid(e._id), di, ev.target.value)}
                          placeholder="—"
                          className="w-14 text-center text-xs bg-slate-900 border border-white/10 rounded-lg px-1 py-1 text-white" />
                      ) : (
                        <span className={`text-xs ${schedule?.[sid(e._id)]?.[di] ? "text-slate-200" : "text-slate-600"}`}>
                          {schedule?.[sid(e._id)]?.[di] || "—"}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Tip: escribe el turno como &ldquo;10–18&rdquo; o &ldquo;Libre&rdquo;. El día de hoy se resalta en verde.</p>
    </div>
  );
}

/* ============================================================================
   AVISOS
   ========================================================================== */
function AnnouncementsTab({ employees, announcements, isManager, onAdd, onRemove }) {
  const [text, setText] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const empName = (id) => employees.find((e) => sid(e._id) === sid(id))?.name.split(" ")[0] || "?";
  const empColor = (id) => employees.find((e) => sid(e._id) === sid(id))?.color || "emerald";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black tracking-tight">Avisos del equipo</h2>
        <p className="text-sm text-slate-400 mt-0.5">Comunicados y novedades del día.</p>
      </div>

      {isManager && (
        <div className="bg-slate-800 rounded-2xl border border-white/5 p-4">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
            placeholder="Escribe un aviso para el equipo…"
            className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none" />
          <div className="flex justify-end mt-3">
            <button disabled={!text.trim()} onClick={() => { onAdd(text.trim()); setText(""); }}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-40 transition">
              <Plus className="w-4 h-4" /> Publicar aviso
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {announcements.length === 0 ? (
          <div className="text-center py-12 bg-slate-800 rounded-2xl border border-white/5">
            <Megaphone className="w-10 h-10 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-500 text-sm">Sin avisos por ahora.</p>
          </div>
        ) : announcements.map((a) => {
          const col = getColor(empColor(a.by));
          return (
            <div key={sid(a._id)} className="bg-slate-800 rounded-2xl border border-white/5 p-4">
              <div className="flex items-start gap-3">
                <span className={`w-9 h-9 rounded-xl ${col.bg} flex items-center justify-center text-[11px] font-bold text-white shrink-0`}>
                  {initials(empName(a.by))}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-white">{empName(a.by)}</p>
                    <p className="text-[11px] text-slate-500">
                      {new Date(a.createdAt).toLocaleDateString("es-MX")} · {fmtTime(a.createdAt)}
                    </p>
                  </div>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">{a.text}</p>
                </div>
                {isManager && (
                  confirmId === sid(a._id) ? (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setConfirmId(null)} className="text-xs px-2 py-1 rounded-lg bg-slate-700 text-slate-300">No</button>
                      <button onClick={() => { onRemove(a._id); setConfirmId(null); }}
                        className="text-xs px-2 py-1 rounded-lg bg-rose-500 text-white">Sí</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmId(sid(a._id))} className="text-slate-600 hover:text-rose-400 shrink-0 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
   PANEL GERENTE
   ========================================================================== */
function PanelTab({ employees, time, now, onAddEmployee, onRemoveEmployee }) {
  const [view, setView] = useState("hoy");
  const empById = (id) => employees.find((e) => sid(e._id) === sid(id));

  const weekAgo = Date.now() - 7 * 86400000;
  const weekEntries = time.filter((t) => new Date(t.clockIn).getTime() >= weekAgo);
  const maxHours = 40 * 60;

  const hoursByEmp = employees.map((e) => {
    const entries = weekEntries.filter((t) => sid(t.employeeId) === sid(e._id));
    const mins = entries.reduce((acc, t) => {
      const start = new Date(t.clockIn).getTime();
      const end = t.clockOut ? new Date(t.clockOut).getTime() : now;
      return acc + (end - start) / 60000;
    }, 0);
    return { emp: e, mins, open: entries.some((t) => !t.clockOut) };
  });

  const activeNow = hoursByEmp.filter((h) => h.open);

  function exportCSV() {
    const rows = [["Empleado", "Rol", "Fecha", "Entrada", "Salida", "Minutos"]];
    time.forEach((t) => {
      const e = empById(t.employeeId);
      rows.push([
        e?.name || "?", e?.role || "", t.date,
        fmtTime(t.clockIn),
        t.clockOut ? fmtTime(t.clockOut) : "en curso",
        t.clockOut ? Math.round((new Date(t.clockOut).getTime() - new Date(t.clockIn).getTime()) / 60000) : "",
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `horas_pokepalace_${todayKey()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight">Panel</h2>
          <p className="text-sm text-slate-400 mt-0.5">Asistencia y horas del equipo.</p>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold transition">
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 rounded-2xl border border-white/5 p-3 text-center">
          <p className="text-2xl font-black text-emerald-400">{activeNow.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">En turno</p>
        </div>
        <div className="bg-slate-800 rounded-2xl border border-white/5 p-3 text-center">
          <p className="text-2xl font-black text-white">{employees.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Empleados</p>
        </div>
        <div className="bg-slate-800 rounded-2xl border border-white/5 p-3 text-center">
          <p className="text-2xl font-black text-amber-400">{time.filter(t => t.date === todayKey()).length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Registros hoy</p>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-2">
        {[["hoy", "Ahora"], ["semana", "7 días"], ["equipo", "Equipo"]].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition ${
              view === id ? "bg-emerald-600 text-white border-emerald-500" : "bg-slate-800 text-slate-400 border-white/5"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {view === "hoy" && (
        <div className="space-y-3">
          {activeNow.length === 0 ? (
            <div className="text-center py-10 bg-slate-800 rounded-2xl border border-white/5">
              <User className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-slate-500 text-sm">Nadie tiene turno activo ahora.</p>
            </div>
          ) : activeNow.map(({ emp }) => {
            const oe = time.find((t) => sid(t.employeeId) === sid(emp._id) && !t.clockOut);
            const col = getColor(emp.color);
            return (
              <div key={sid(emp._id)} className="bg-slate-800 rounded-2xl border border-white/5 p-4 flex items-center gap-3">
                <span className={`w-11 h-11 rounded-xl ${col.bg} flex items-center justify-center font-bold text-white`}>{initials(emp.name)}</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-white">{emp.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{emp.role}</p>
                </div>
                <div className="text-right">
                  <span className="flex items-center gap-1 text-emerald-400 text-xs justify-end mb-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> activo
                  </span>
                  <p className="text-sm font-bold tabular-nums text-white">
                    {fmtHM((now - new Date(oe.clockIn).getTime()) / 60000)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "semana" && (
        <div className="bg-slate-800 rounded-2xl border border-white/5 divide-y divide-white/5">
          {hoursByEmp.sort((a, b) => b.mins - a.mins).map(({ emp, mins, open }) => {
            const col = getColor(emp.color);
            return (
              <div key={sid(emp._id)} className="flex items-center gap-3 p-4">
                <span className={`w-9 h-9 rounded-xl ${col.bg} flex items-center justify-center text-xs font-bold text-white shrink-0`}>{initials(emp.name)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="font-semibold text-sm text-white truncate">{emp.name.split(" ")[0]}</p>
                    {open && <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">activo</span>}
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full ${col.bg} rounded-full`} style={{ width: `${Math.min(100, (mins / maxHours) * 100)}%` }} />
                  </div>
                </div>
                <p className="text-sm font-bold tabular-nums text-white shrink-0">{fmtHM(mins)}</p>
              </div>
            );
          })}
        </div>
      )}

      {view === "equipo" && (
        <TeamManager employees={employees} onAdd={onAddEmployee} onRemove={onRemoveEmployee} />
      )}
    </div>
  );
}

/* ---------- Team Manager ---------- */
function TeamManager({ employees, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", role: "employee", pin: "", color: "emerald" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const ROLE_LABELS = { owner: "Dueño", manager: "Gerente", employee: "Empleado" };
  const COLOR_OPTIONS = Object.keys(COLORS);

  async function handleAdd() {
    if (!form.name.trim()) return setError("Escribe el nombre");
    if (form.pin.length !== 4) return setError("El PIN debe tener exactamente 4 dígitos");
    setError(""); setSaving(true);
    try {
      await onAdd(form);
      setForm({ name: "", role: "employee", pin: "", color: "emerald" });
      setAdding(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Schedule tip for partners */}
      <div className="bg-emerald-900/30 border border-emerald-700/30 rounded-2xl p-4">
        <p className="text-xs font-semibold text-emerald-400 mb-1">💡 Tip para 3 socios — 2 días cada uno</p>
        <div className="grid grid-cols-3 gap-2 text-center mt-2">
          {[["Socio 1", "Lun · Mar"], ["Socio 2", "Mié · Jue"], ["Socio 3", "Vie · Sáb"]].map(([s, d]) => (
            <div key={s} className="bg-slate-900/60 rounded-xl py-2">
              <p className="text-[10px] text-slate-400">{s}</p>
              <p className="text-xs font-bold text-white mt-0.5">{d}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-2">Configúralo en la pestaña Horario una vez que tengas al equipo registrado.</p>
      </div>

      {/* Employee list */}
      <div className="bg-slate-800 rounded-2xl border border-white/5 divide-y divide-white/5">
        {employees.map((e) => {
          const col = getColor(e.color);
          return (
            <div key={sid(e._id)} className="flex items-center gap-3 p-4">
              <span className={`w-10 h-10 rounded-xl ${col.bg} flex items-center justify-center text-sm font-bold text-white shrink-0`}>
                {initials(e.name)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-white truncate">{e.name}</p>
                <p className={`text-xs capitalize ${col.text}`}>{ROLE_LABELS[e.role] || e.role}</p>
              </div>
              {confirmId === sid(e._id) ? (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setConfirmId(null)} className="text-xs px-2 py-1.5 rounded-lg bg-slate-700 text-slate-300">No</button>
                  <button onClick={() => { onRemove(e._id); setConfirmId(null); }}
                    className="text-xs px-2 py-1.5 rounded-lg bg-rose-500 text-white font-semibold">Sí, eliminar</button>
                </div>
              ) : (
                <button onClick={() => setConfirmId(sid(e._id))} className="text-slate-600 hover:text-rose-400 transition shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add form */}
      {adding ? (
        <div className="bg-slate-800 rounded-2xl border border-emerald-500/30 p-4 space-y-3">
          <p className="text-sm font-bold text-white">Nuevo empleado</p>

          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre completo"
            className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />

          <div className="grid grid-cols-2 gap-2">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500">
              <option value="employee">Empleado</option>
              <option value="manager">Gerente</option>
              <option value="owner">Dueño / Socio</option>
            </select>
            <input value={form.pin} inputMode="numeric"
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              placeholder="PIN (4 dígitos)"
              className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 tracking-widest" />
          </div>

          {/* Color picker */}
          <div>
            <p className="text-xs text-slate-400 mb-2">Color de avatar</p>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-lg ${COLORS[c].bg} transition-all ${form.color === c ? "ring-2 ring-offset-2 ring-offset-slate-800 ring-white scale-110" : "opacity-60 hover:opacity-100"}`} />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={() => { setAdding(false); setError(""); }}
              className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold transition">
              Cancelar
            </button>
            <button onClick={handleAdd} disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition disabled:opacity-50">
              {saving ? "Guardando…" : "Agregar"}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-2xl py-4 text-sm text-slate-500 hover:text-emerald-400 transition">
          <Plus className="w-4 h-4" /> Agregar empleado
        </button>
      )}
    </div>
  );
}

/* ============================================================================
   BOTTOM NAV
   ========================================================================== */
function BottomNav({ tab, setTab, isManager, openEntry }) {
  const items = [
    { id: "inicio",   label: "Inicio",   icon: Clock       },
    { id: "tareas",   label: "Tareas",   icon: CheckSquare },
    { id: "temp",     label: "Temp",     icon: Thermometer },
    { id: "horario",  label: "Horario",  icon: Calendar    },
    { id: "avisos",   label: "Avisos",   icon: Megaphone   },
  ];
  if (isManager) items.push({ id: "panel", label: "Panel", icon: TrendingUp });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 bg-slate-900/95 backdrop-blur border-t border-white/5">
      <div className="max-w-3xl mx-auto flex justify-around px-2 py-2">
        {items.map(({ id, label, icon: Icon }) => {
          const isActive = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all relative ${
                isActive ? "text-emerald-400" : "text-slate-500 hover:text-slate-300"
              }`}>
              {id === "inicio" && openEntry && (
                <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
              <Icon className={`w-5 h-5 ${isActive ? "scale-110" : ""} transition-transform`} />
              <span className={`text-[10px] font-medium ${isActive ? "text-emerald-400" : ""}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
