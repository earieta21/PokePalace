import { useState, useEffect, useMemo } from "react";
import {
  Clock, LogIn, LogOut, CheckSquare, Thermometer, Calendar, Megaphone,
  TrendingUp, ChevronLeft, Delete, Plus, AlertTriangle, Snowflake,
  Refrigerator, Flame, Trash2, Leaf, ShieldCheck, User, Download,
  ShoppingCart, UtensilsCrossed, ClipboardList, BarChart3, Activity, Package,
  ToggleRight, Gift, Coffee, Copy, QrCode, Share2,
} from "lucide-react";
import {
  BASE_LABELS, PROTEIN_LABELS, MARINADE_LABELS,
  COMPLEMENT_LABELS, SAUCE_LABELS, TOPPING_LABELS,
} from "../order/OrderLabels";
import { StaffAuthContext } from "../context/StaffAuthContext";
import { API_URL } from "../config";
import { downloadCSV } from "../utils/csv";
import RewardQrCode from "../components/RewardQrCode";

// POS pages — unchanged, work via StaffAuthContext.Provider
import POSPage from "../pos/pages/POSPage";
import KDSPage from "../pos/pages/KDSPage";
import OrderHistoryPage from "../pos/pages/OrderHistoryPage";
import FinancePage from "../pos/pages/FinancePage";
import SalesDashboardPage from "../pos/pages/SalesDashboardPage";
import InventoryPage from "../pos/pages/InventoryPage";
import posStyles from "../pos/EmployeePortal.module.css";

/* ============================================================================
   CONSTANTS
   ========================================================================== */
const LOCATION_ID = "tij-centro-01";
const todayKey = () => new Date().toISOString().slice(0, 10);

// Ubicación GPS del dispositivo — el backend valida que esté dentro del
// radio del restaurante antes de dejar marcar entrada/salida/lonche.
function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este dispositivo no soporta ubicación GPS."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error("Activa el permiso de ubicación para poder marcar tu entrada/salida.")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}
const fmtTime = (d) => new Date(d).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
const fmtHM = (mins) => `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, "0")}m`;
const initials = (name) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
const sid = (id) => String(id);

const COLORS = {
  emerald: { bg: "bg-emerald-500", text: "text-emerald-400", light: "bg-emerald-500/20", ring: "ring-emerald-400" },
  amber:   { bg: "bg-amber-500",   text: "text-amber-400",   light: "bg-amber-500/20",   ring: "ring-amber-400"   },
  sky:     { bg: "bg-sky-500",     text: "text-sky-400",     light: "bg-sky-500/20",     ring: "ring-sky-400"     },
  rose:    { bg: "bg-rose-500",    text: "text-rose-400",    light: "bg-rose-500/20",    ring: "ring-rose-400"    },
  violet:  { bg: "bg-violet-500",  text: "text-violet-400",  light: "bg-violet-500/20",  ring: "ring-violet-400"  },
  orange:  { bg: "bg-orange-500",  text: "text-orange-400",  light: "bg-orange-500/20",  ring: "ring-orange-400"  },
};
const COLOR_KEYS = Object.keys(COLORS);
const getColor = (c) => COLORS[c] || COLORS.emerald;

const ROLE_LABEL = { owner: "Dueño/a", manager: "Gerente", admin: "Admin", cashier: "Cajero/a", kitchen: "Cocina", employee: "Empleado/a" };

const CHECKLISTS = {
  apertura: { label: "Apertura",  icon: LogIn,      color: "text-emerald-400", items: [
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
  cierre:   { label: "Cierre",    icon: LogOut,     color: "text-rose-400", items: [
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
  limpieza: { label: "Limpieza",  icon: ShieldCheck, color: "text-sky-400", items: [
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
  { id: "refri-prot", label: "Refri proteínas",  icon: Refrigerator, min: 0,   max: 4,   unit: "°C", accent: "sky"     },
  { id: "barra-fria", label: "Barra fría",        icon: Snowflake,    min: 0,   max: 4,   unit: "°C", accent: "emerald" },
  { id: "congelador", label: "Congelador",        icon: Snowflake,    min: -30, max: -18, unit: "°C", accent: "violet"  },
  { id: "linea",      label: "Producto en línea", icon: Flame,        min: 0,   max: 4,   unit: "°C", accent: "amber"   },
];

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Which tabs each role sees
// Orden pensado por frecuencia de uso en un turno normal: primero lo
// operativo (pos/cocina/premios), luego lo personal/diario (inicio, tareas,
// temp), luego consulta frecuente (disponibilidad, hist, inv), luego lo
// periódico (horario, avisos), y al final lo administrativo/menos frecuente
// (ventas, fin, panel).
const TABS_BY_ROLE = {
  employee: ["inicio", "tareas", "temp", "horario", "avisos"],
  cashier:  ["pos", "premios", "inicio", "tareas", "temp", "hist", "horario", "avisos"],
  kitchen:  ["cocina", "inicio", "tareas", "temp", "hist", "horario", "avisos"],
  manager:  ["pos", "cocina", "premios", "inicio", "tareas", "temp", "disponibilidad", "hist", "inv", "horario", "avisos", "ventas", "fin", "panel"],
  admin:    ["pos", "cocina", "premios", "inicio", "tareas", "temp", "disponibilidad", "hist", "inv", "horario", "avisos", "ventas", "fin", "panel"],
  owner:    ["pos", "cocina", "premios", "inicio", "tareas", "temp", "disponibilidad", "hist", "inv", "horario", "avisos", "ventas", "fin", "panel"],
};

const TAB_META = {
  pos:     { label: "POS",      icon: ShoppingCart   },
  cocina:  { label: "Cocina",   icon: UtensilsCrossed },
  premios: { label: "Premios",  icon: Gift            },
  hist:    { label: "Historial", icon: ClipboardList  },
  ventas:  { label: "Ventas",   icon: Activity        },
  inv:     { label: "Inventario", icon: Package       },
  fin:     { label: "Finanzas", icon: BarChart3       },
  disponibilidad: { label: "Tienda", icon: ToggleRight },
  panel:   { label: "Panel",    icon: TrendingUp      },
  inicio:  { label: "Inicio",   icon: Clock           },
  tareas:  { label: "Tareas",   icon: CheckSquare     },
  temp:    { label: "Temp",     icon: Thermometer     },
  horario: { label: "Horario",  icon: Calendar        },
  avisos:  { label: "Avisos",   icon: Megaphone       },
};

/* ============================================================================
   UNIFIED STAFF APP
   ========================================================================== */
export default function UnifiedStaffApp() {
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [employees, setEmployees] = useState([]);

  // Auth state (token in memory only — shared tablet)
  const [token, setToken] = useState(null);
  const [me, setMe] = useState(null); // { id, name, role, color, isManager }

  // Kiosk data (loaded after login)
  const [time, setTime] = useState([]);
  const [checklist, setChecklist] = useState({});
  const [temps, setTemps] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [announcements, setAnnouncements] = useState([]);

  const [tab, setTab] = useState(null); // set after login based on role
  const [now, setNow] = useState(Date.now());
  const [lowStockCount, setLowStockCount] = useState(0);
  const [clockError, setClockError] = useState("");
  const [clockBusy, setClockBusy] = useState(false);

  // Load employee list for login screen
  useEffect(() => {
    fetch(`${API_URL}/api/kiosk/employees?locationId=${LOCATION_ID}`)
      .then((r) => r.json())
      .then((d) => { setEmployees(d.employees || []); setLoadingEmps(false); })
      .catch(() => setLoadingEmps(false));
  }, []);

  // Load low-stock count after login (for badge on Inventario tab)
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/staff/inventory/low-stock`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setLowStockCount(d.count ?? 0))
      .catch(() => {});
  }, [token]);

  // Load kiosk data after login
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

  // Remove customer app's bottom padding
  useEffect(() => {
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "0";
    return () => { document.body.style.paddingBottom = prev; };
  }, []);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {}),
    [token]
  );

  const openEntry = useMemo(
    () => (me ? time.find((t) => sid(t.employeeId) === sid(me.id) && !t.clockOut) : null),
    [time, me]
  );

  const isManager = Boolean(me?.isManager);
  const myTabs = TABS_BY_ROLE[me?.role] || TABS_BY_ROLE.employee;

  // StaffAuthContext value — lets POS/KDS components work unchanged
  const staffContextValue = useMemo(() => ({
    staffToken: token,
    staffUser: me ? { id: me.id, name: me.name, role: me.role } : null,
    isStaffLoggedIn: !!token,
    staffLogin: () => {},
    staffLogout: handleLogout,
  }), [token, me]);

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
    const tabs = TABS_BY_ROLE[user.role] || TABS_BY_ROLE.employee;
    setTab(tabs[0]);
  }

  function handleLogout() {
    setToken(null); setMe(null); setTab(null); setLowStockCount(0);
    setEmployees((current) => current.map(({ _id, name, color }) => ({ _id, name, color })));
    setTime([]); setChecklist({}); setTemps([]); setSchedule({}); setAnnouncements([]);
  }

  async function withDeviceLocation(fn) {
    setClockError(""); setClockBusy(true);
    try {
      const { lat, lng } = await getDeviceLocation();
      await fn({ lat, lng });
    } catch (err) {
      setClockError(err.message || "No se pudo completar la acción.");
    } finally {
      setClockBusy(false);
    }
  }

  async function clockIn() {
    await withDeviceLocation(async ({ lat, lng }) => {
      const r = await fetch(`${API_URL}/api/kiosk/time/clock-in`, {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({ locationId: LOCATION_ID, date: todayKey(), lat, lng }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "No se pudo marcar tu entrada.");
      if (data.record) setTime((p) => [data.record, ...p]);
    });
  }

  async function clockOut() {
    await withDeviceLocation(async ({ lat, lng }) => {
      const r = await fetch(`${API_URL}/api/kiosk/time/clock-out`, {
        method: "POST", headers: authHeaders, body: JSON.stringify({ lat, lng }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "No se pudo marcar tu salida.");
      if (data.record) setTime((p) => p.map((t) => sid(t._id) === sid(data.record._id) ? data.record : t));
    });
  }

  async function startBreak() {
    await withDeviceLocation(async ({ lat, lng }) => {
      const r = await fetch(`${API_URL}/api/kiosk/time/break-start`, {
        method: "POST", headers: authHeaders, body: JSON.stringify({ lat, lng }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "No se pudo iniciar tu lonche.");
      if (data.record) setTime((p) => p.map((t) => sid(t._id) === sid(data.record._id) ? data.record : t));
    });
  }

  async function endBreak() {
    await withDeviceLocation(async ({ lat, lng }) => {
      const r = await fetch(`${API_URL}/api/kiosk/time/break-end`, {
        method: "POST", headers: authHeaders, body: JSON.stringify({ lat, lng }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "No se pudo terminar tu lonche.");
      if (data.record) setTime((p) => p.map((t) => sid(t._id) === sid(data.record._id) ? data.record : t));
    });
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

  async function saveSchedule(draft) {
    await fetch(`${API_URL}/api/kiosk/schedule`, {
      method: "PUT", headers: authHeaders,
      body: JSON.stringify({ locationId: LOCATION_ID, schedule: draft }),
    });
    setSchedule(draft);
  }

  async function updateEmployee(id, patch) {
    const r = await fetch(`${API_URL}/api/kiosk/employees/${id}`, {
      method: "PATCH", headers: authHeaders,
      body: JSON.stringify(patch),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "Error"); }
    const { employee } = await r.json();
    if (employee) setEmployees((p) => p.map((e) => sid(e._id) === sid(id) ? { ...e, ...employee } : e));
  }

  async function addEmployee(form) {
    const r = await fetch(`${API_URL}/api/kiosk/employees`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ ...form, locationId: LOCATION_ID }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "Error"); }
    const { employee } = await r.json();
    if (employee) setEmployees((p) => [...p, employee]);
  }

  async function removeEmployee(id) {
    await fetch(`${API_URL}/api/kiosk/employees/${id}`, { method: "DELETE", headers: authHeaders });
    setEmployees((p) => p.filter((e) => sid(e._id) !== sid(id)));
  }

  if (loadingEmps) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <Leaf className="w-8 h-8 text-emerald-400" />
        </div>
        <p className="text-slate-400 text-sm tracking-widest uppercase">Cargando…</p>
      </div>
    </div>
  );

  if (!me) return <PinLogin employees={employees} onLogin={handleLogin} />;

  const isPOSTab = tab === "pos" || tab === "cocina";

  return (
    <StaffAuthContext.Provider value={staffContextValue}>
      <div className="min-h-screen bg-slate-950 text-white flex flex-col" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>

        {/* Header */}
        <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-white/5 px-4 py-3 shrink-0">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Leaf className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400 leading-none">Poke Palace · Staff</p>
                <p className="text-sm font-bold leading-tight">{me.name}
                  <span className={`ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded-full ${getColor(employees.find(e=>sid(e._id)===sid(me.id))?.color||"emerald").light} ${getColor(employees.find(e=>sid(e._id)===sid(me.id))?.color||"emerald").text}`}>
                    {ROLE_LABEL[me.role] || me.role}
                  </span>
                </p>
              </div>
              {openEntry && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> En turno
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono font-semibold text-slate-300 tabular-nums hidden sm:block">
                {new Date(now).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <button onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition">
                <LogOut className="w-3.5 h-3.5" /> Salir
              </button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className={`flex-1 w-full mx-auto ${isPOSTab ? "max-w-5xl" : "max-w-3xl"} px-4 py-5 pb-28`}>
          {tab === "inicio"  && <HomeTab me={me} now={now} openEntry={openEntry} time={time} schedule={schedule} checklist={checklist} onClockIn={clockIn} onClockOut={clockOut} onBreakStart={startBreak} onBreakEnd={endBreak} clockError={clockError} clockBusy={clockBusy} />}
          {tab === "tareas"  && <TasksTab employees={employees} checklist={checklist} onToggle={toggleTask} />}
          {tab === "temp"    && <TempsTab employees={employees} temps={temps} onAdd={addTemp} />}
          {tab === "horario" && <ScheduleTab employees={employees} schedule={schedule} isManager={isManager} onSave={saveSchedule} />}
          {tab === "avisos"  && <AnnouncementsTab employees={employees} announcements={announcements} isManager={isManager} onAdd={addAnnouncement} onRemove={removeAnnouncement} />}
          {tab === "premios" && <RewardsRedeemTab token={token} />}
          {tab === "disponibilidad" && <AvailabilityTab token={token} role={me?.role} />}
          {tab === "panel"   && <PanelTab employees={employees} time={time} now={now} onAddEmployee={addEmployee} onRemoveEmployee={removeEmployee} onUpdateEmployee={updateEmployee} />}
          {tab === "pos"     && <POSPage styles={posStyles} role={me.role} staffUser={{ id: me.id, name: me.name, role: me.role }} />}
          {tab === "cocina"  && <KDSPage styles={posStyles} role={me.role} staffUser={{ id: me.id, name: me.name, role: me.role }} />}
          {tab === "hist"    && <OrderHistoryPage styles={posStyles} />}
          {tab === "ventas"  && <SalesDashboardPage styles={posStyles} />}
          {tab === "inv"     && <InventoryPage styles={posStyles} />}
          {tab === "fin"     && <FinancePage styles={posStyles} />}
        </main>

        {/* Bottom nav */}
        <BottomNav tab={tab} setTab={setTab} tabs={myTabs} openEntry={openEntry} lowStockCount={lowStockCount} />
      </div>
    </StaffAuthContext.Provider>
  );
}

/* ============================================================================
   PIN LOGIN
   ========================================================================== */
function PinLogin({ employees, onLogin }) {
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
      <div className="px-6 pt-10 pb-8 text-center relative">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/50 to-transparent pointer-events-none" />
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-900/30">
            <Leaf className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">Poke Palace</h1>
          <p className="text-emerald-400 text-xs uppercase tracking-[0.3em] mt-1">Portal de Personal</p>
        </div>
      </div>

      {!selected ? (
        <div className="flex-1 px-5 max-w-2xl mx-auto w-full">
          <p className="text-slate-400 text-sm mb-5 text-center">Selecciona tu nombre para continuar</p>
          <div className="grid grid-cols-2 gap-3">
            {employees.map((e) => {
              const col = getColor(e.color);
              return (
                <button key={sid(e._id)} onClick={() => { setSelected(e); setPin(""); setError(false); }}
                  className="group relative overflow-hidden flex items-center gap-4 bg-slate-900 hover:bg-slate-800 border border-white/5 hover:border-white/10 rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98]">
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
            <ChevronLeft className="w-4 h-4" /> Volver
          </button>
          <div className={`w-20 h-20 rounded-2xl ${getColor(selected.color).bg} flex items-center justify-center font-bold text-white text-2xl mb-3 shadow-xl`}>
            {initials(selected.name)}
          </div>
          <p className="font-bold text-lg text-white mb-0.5">{selected.name}</p>
          <p className={`text-xs mb-5 ${getColor(selected.color).text}`}>Personal</p>
          <div className="flex gap-4 mb-8">
            {[0,1,2,3].map((i) => (
              <div key={i} className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
                error ? "bg-rose-500 border-rose-500 scale-110"
                : pin.length > i ? `${getColor(selected.color).bg} border-transparent scale-110`
                : "border-slate-600"}`} />
            ))}
          </div>
          {error && <p className="text-rose-400 text-xs -mt-4 mb-4">PIN incorrecto, intenta de nuevo</p>}
          <div className="grid grid-cols-3 gap-3 w-full">
            {[1,2,3,4,5,6,7,8,9].map((d) => (
              <PinKey key={d} onClick={() => press(String(d))}>{d}</PinKey>
            ))}
            <div />
            <PinKey onClick={() => press("0")}>0</PinKey>
            <PinKey subtle onClick={() => { setError(false); setPin((p) => p.slice(0, -1)); }}>
              <Delete className="w-5 h-5 mx-auto" />
            </PinKey>
          </div>
        </div>
      )}
    </div>
  );
}

function PinKey({ children, onClick, subtle }) {
  return (
    <button onClick={onClick}
      className={`h-16 rounded-2xl text-xl font-semibold transition-all active:scale-95 ${
        subtle ? "bg-slate-800 hover:bg-slate-700 text-slate-400" : "bg-slate-800 hover:bg-slate-700 text-white border border-white/5"
      }`}>
      {children}
    </button>
  );
}

/* ============================================================================
   HOME — CLOCK IN/OUT
   ========================================================================== */
const FORGOT_CLOCKOUT_HOURS = 13;

function HomeTab({ me, now, openEntry, time, schedule, checklist, onClockIn, onClockOut, onBreakStart, onBreakEnd, clockError, clockBusy }) {
  const [confirmOut, setConfirmOut] = useState(false);
  const todayEntries = time.filter((t) => sid(t.employeeId) === sid(me.id) && t.date === todayKey());

  const breakMinsOf = (t) => (t.breaks || []).reduce((bAcc, b) => {
    const bStart = new Date(b.start).getTime();
    const bEnd = b.end ? new Date(b.end).getTime() : now;
    return bAcc + (bEnd - bStart) / 60000;
  }, 0);

  const workedMins = todayEntries.reduce((acc, t) => {
    const start = new Date(t.clockIn).getTime();
    const end = t.clockOut ? new Date(t.clockOut).getTime() : (sid(t._id) === sid(openEntry?._id) ? now : start);
    const grossMins = (end - start) / 60000;
    return acc + Math.max(0, grossMins - breakMinsOf(t));
  }, 0);

  const openBreak = openEntry?.breaks?.find((b) => !b.end);
  const breakMins = openBreak ? (now - new Date(openBreak.start).getTime()) / 60000 : 0;
  const forgotToClockOut = openEntry && !openBreak &&
    (now - new Date(openEntry.clockIn).getTime()) > FORGOT_CLOCKOUT_HOURS * 3600 * 1000;

  const myShift = schedule?.[sid(me.id)]?.[(new Date().getDay() + 6) % 7];
  const totalTasks = Object.values(CHECKLISTS).reduce((a, l) => a + l.items.length, 0);
  const doneTasks = CHECK_IDS.reduce((a, lid) => a + Object.keys(checklist?.[lid] || {}).length, 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-slate-400 text-sm capitalize">
          {new Date(now).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h2 className="text-2xl font-black tracking-tight">¡Hola, {me.name.split(" ")[0]}!</h2>
      </div>

      {forgotToClockOut && (
        <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            Tu turno lleva abierto más de {FORGOT_CLOCKOUT_HOURS}h desde las {fmtTime(openEntry.clockIn)} — si ya te fuiste, no olvides marcar salida.
          </p>
        </div>
      )}

      {clockError && (
        <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-300">{clockError}</p>
        </div>
      )}

      <div className={`relative overflow-hidden rounded-3xl p-6 ${openBreak ? "bg-amber-600" : openEntry ? "bg-emerald-600" : "bg-slate-800"} transition-colors duration-500`}>
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-black/10 translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <span className={`text-xs uppercase tracking-widest font-semibold ${openEntry ? "text-white/90" : "text-slate-400"}`}>
              {openBreak ? "En lonche" : openEntry ? "Turno activo" : "Sin turno activo"}
            </span>
            {openEntry && (
              <span className="flex items-center gap-1.5 text-[11px] text-white/90 bg-black/20 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-lime-300 animate-pulse" />
                {openBreak ? `desde ${fmtTime(openBreak.start)}` : `desde ${fmtTime(openEntry.clockIn)}`}
              </span>
            )}
          </div>
          <p className={`text-xs mb-1 ${openEntry ? "text-white/80" : "text-slate-500"}`}>
            {openBreak ? "Tiempo de lonche" : "Trabajado hoy"}
          </p>
          <p className="text-5xl font-black tabular-nums mb-6">{fmtHM(openBreak ? breakMins : workedMins)}</p>

          {openBreak ? (
            <button onClick={onBreakEnd} disabled={clockBusy} className="w-full flex items-center justify-center gap-2 bg-black/20 hover:bg-black/30 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-base transition active:scale-[0.98]">
              <Coffee className="w-5 h-5" /> {clockBusy ? "Verificando ubicación…" : "Terminar lonche"}
            </button>
          ) : openEntry ? (
            confirmOut ? (
              <div className="space-y-2">
                <p className="text-sm text-center text-emerald-100 mb-3">¿Confirmas tu salida?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmOut(false)} className="flex-1 bg-black/20 hover:bg-black/30 text-white font-semibold py-3.5 rounded-2xl text-sm transition">Cancelar</button>
                  <button onClick={() => { setConfirmOut(false); onClockOut(); }} disabled={clockBusy} className="flex-1 bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl text-sm transition">
                    {clockBusy ? "Verificando…" : "Sí, marcar salida"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={() => setConfirmOut(true)} disabled={clockBusy} className="w-full flex items-center justify-center gap-2 bg-black/20 hover:bg-black/30 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-base transition active:scale-[0.98]">
                  <LogOut className="w-5 h-5" /> {clockBusy ? "Verificando ubicación…" : "Marcar salida"}
                </button>
                <button onClick={onBreakStart} disabled={clockBusy} className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 disabled:opacity-60 text-white font-semibold py-3 rounded-2xl text-sm transition active:scale-[0.98]">
                  <Coffee className="w-4 h-4" /> Iniciar lonche
                </button>
              </div>
            )
          ) : (
            <button onClick={onClockIn} disabled={clockBusy} className="w-full flex items-center justify-center gap-2 bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-slate-900 font-bold py-4 rounded-2xl text-base transition active:scale-[0.98]">
              <LogIn className="w-5 h-5" /> {clockBusy ? "Verificando ubicación…" : "Marcar entrada"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800 rounded-2xl p-4 border border-white/5">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2"><Calendar className="w-3.5 h-3.5" /> Mi turno hoy</div>
          <p className="font-bold text-white">{myShift || "Sin asignar"}</p>
        </div>
        <div className="bg-slate-800 rounded-2xl p-4 border border-white/5">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2"><CheckSquare className="w-3.5 h-3.5" /> Tareas</div>
          <p className="font-bold text-white mb-2">{doneTasks}/{totalTasks}</p>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${totalTasks > 0 ? Math.round((doneTasks/totalTasks)*100) : 0}%` }} />
          </div>
        </div>
      </div>

      {todayEntries.length > 0 && (
        <div className="bg-slate-800 rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-sm font-semibold text-slate-300">Registros de hoy</p>
          </div>
          <ul className="divide-y divide-white/5">
            {todayEntries.map((t) => (
              <li key={sid(t._id)} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-emerald-400"><LogIn className="w-4 h-4" />{fmtTime(t.clockIn)}</span>
                  <span className="flex items-center gap-2 text-slate-400">
                    {t.clockOut ? <><LogOut className="w-4 h-4 text-rose-400" />{fmtTime(t.clockOut)}</> : <span className="text-emerald-400 animate-pulse">en curso…</span>}
                  </span>
                </div>
                {(t.breaks || []).length > 0 && (
                  <div className="mt-1.5 pl-6 space-y-0.5">
                    {t.breaks.map((b, i) => (
                      <p key={i} className="text-[11px] text-amber-400/80 flex items-center gap-1.5">
                        <Coffee className="w-3 h-3" />
                        lonche {fmtTime(b.start)} – {b.end ? fmtTime(b.end) : "en curso…"}
                      </p>
                    ))}
                  </div>
                )}
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
        <p className="text-sm text-slate-400 mt-0.5">Registro de quién completó cada tarea.</p>
      </div>
      <div className="flex gap-2">
        {CHECK_IDS.map((id) => {
          const L = CHECKLISTS[id]; const Icon = L.icon;
          return (
            <button key={id} onClick={() => setActive(id)}
              className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border text-xs font-semibold transition-all ${active === id ? "bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-900/30" : "bg-slate-800 text-slate-400 border-white/5"}`}>
              <Icon className={`w-5 h-5 ${active === id ? "text-white" : L.color}`} />{L.label}
            </button>
          );
        })}
      </div>
      <div className="bg-slate-800 rounded-2xl border border-white/5 p-4">
        <div className="flex justify-between mb-2">
          <span className="text-sm font-semibold">{list.label}</span>
          <span className="text-xs text-slate-400">{completed}/{list.items.length} — {pct}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="bg-slate-800 rounded-2xl border border-white/5 overflow-hidden">
        <ul className="divide-y divide-white/5">
          {list.items.map((item, idx) => {
            const rec = done[String(idx)];
            return (
              <li key={idx} onClick={() => onToggle(active, idx)}
                className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-white/3 transition-colors">
                <span className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border-2 shrink-0 transition-all ${rec ? "bg-emerald-500 border-emerald-500" : "border-slate-600"}`}>
                  {rec && <CheckSquare className="w-3.5 h-3.5 text-white" />}
                </span>
                <span className="flex-1">
                  <span className={`text-sm ${rec ? "line-through text-slate-500" : "text-slate-200"}`}>{item}</span>
                  {rec && <span className="block text-[11px] text-emerald-500 mt-0.5">✓ {empName(rec.by)} · {fmtTime(rec.ts)}</span>}
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black tracking-tight">Temperaturas</h2>
        <p className="text-sm text-slate-400 mt-0.5">Registra al abrir y cerrar. Fuera de rango = alerta.</p>
      </div>
      {TEMP_STATIONS.map((st) => {
        const Icon = st.icon;
        const todays = temps.filter((t) => t.stationId === st.id && t.date === dk);
        const last = todays[0];
        const out = last && (last.value < st.min || last.value > st.max);
        const col = getColor(st.accent);
        return (
          <div key={st.id} className={`bg-slate-800 rounded-2xl border overflow-hidden ${out ? "border-rose-500/40" : "border-white/5"}`}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className={`w-10 h-10 rounded-xl ${col.light} flex items-center justify-center`}><Icon className={`w-5 h-5 ${col.text}`} /></span>
                  <div>
                    <p className="font-semibold text-sm">{st.label}</p>
                    <p className="text-[11px] text-slate-500">Rango: {st.min} a {st.max}{st.unit}</p>
                  </div>
                </div>
                {last && (
                  <div className={`text-right ${out ? "text-rose-400" : "text-emerald-400"}`}>
                    <p className="text-2xl font-black tabular-nums">{last.value}{st.unit}</p>
                    <p className="text-[10px] text-slate-500">{fmtTime(last.ts)}</p>
                  </div>
                )}
              </div>
              {out && (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5 mb-4">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> Fuera de rango. Avisa al gerente de inmediato.
                </div>
              )}
              <div className="flex gap-2">
                <input type="number" inputMode="decimal" placeholder={`Temperatura en ${st.unit}`}
                  value={vals[st.id] ?? ""} onChange={(e) => setVals((p) => ({ ...p, [st.id]: e.target.value }))}
                  className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                <button onClick={() => { if (!vals[st.id] && vals[st.id] !== 0) return; onAdd(st.id, vals[st.id]); setVals((p) => ({ ...p, [st.id]: "" })); }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 rounded-xl transition">Registrar</button>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight">Horario semanal</h2>
          <p className="text-sm text-slate-400 mt-0.5">Turnos del equipo por día.</p>
        </div>
        {isManager && (editing
          ? <div className="flex gap-2">
              <button onClick={() => { setDraft(schedule); setEditing(false); }} className="text-sm px-3 py-2 rounded-xl bg-slate-700 text-slate-300 hover:bg-slate-600 transition">Cancelar</button>
              <button onClick={() => { onSave(draft); setEditing(false); }} className="text-sm px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition">Guardar</button>
            </div>
          : <button onClick={() => setEditing(true)} className="text-sm px-4 py-2 rounded-xl bg-slate-700 text-white font-semibold hover:bg-slate-600 transition">Editar</button>
        )}
      </div>
      <div className="overflow-x-auto bg-slate-800 rounded-2xl border border-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-4 py-3 font-medium text-slate-400 sticky left-0 bg-slate-800">Empleado</th>
              {DAYS.map((d, i) => <th key={d} className={`px-3 py-3 font-medium text-center min-w-[56px] ${i === todayIdx ? "text-emerald-400" : "text-slate-400"}`}>{d}</th>)}
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
                      <span className="font-medium text-sm">{e.name.split(" ")[0]}</span>
                    </div>
                  </td>
                  {DAYS.map((_, di) => (
                    <td key={di} className={`px-1 py-2 text-center ${di === todayIdx ? "bg-emerald-900/20" : ""}`}>
                      {editing
                        ? <input value={draft?.[sid(e._id)]?.[di] || ""} onChange={(ev) => setDraft((p) => ({ ...p, [sid(e._id)]: { ...(p[sid(e._id)] || {}), [di]: ev.target.value } }))}
                            placeholder="—" className="w-14 text-center text-xs bg-slate-900 border border-white/10 rounded-lg px-1 py-1 text-white" />
                        : <span className={`text-xs ${schedule?.[sid(e._id)]?.[di] ? "text-slate-200" : "text-slate-600"}`}>{schedule?.[sid(e._id)]?.[di] || "—"}</span>
                      }
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Tip: escribe el turno como &ldquo;10–18&rdquo; o &ldquo;Libre&rdquo;. Hoy se resalta en verde.</p>
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
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Escribe un aviso…"
            className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none" />
          <div className="flex justify-end mt-3">
            <button disabled={!text.trim()} onClick={() => { onAdd(text.trim()); setText(""); }}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-40 transition">
              <Plus className="w-4 h-4" /> Publicar
            </button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {announcements.length === 0
          ? <div className="text-center py-12 bg-slate-800 rounded-2xl border border-white/5"><Megaphone className="w-10 h-10 mx-auto mb-3 text-slate-600" /><p className="text-slate-500 text-sm">Sin avisos por ahora.</p></div>
          : announcements.map((a) => {
              const col = getColor(empColor(a.by));
              return (
                <div key={sid(a._id)} className="bg-slate-800 rounded-2xl border border-white/5 p-4">
                  <div className="flex items-start gap-3">
                    <span className={`w-9 h-9 rounded-xl ${col.bg} flex items-center justify-center text-[11px] font-bold text-white shrink-0`}>{initials(empName(a.by))}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold">{empName(a.by)}</p>
                        <p className="text-[11px] text-slate-500">{new Date(a.createdAt).toLocaleDateString("es-MX")} · {fmtTime(a.createdAt)}</p>
                      </div>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">{a.text}</p>
                    </div>
                    {isManager && (confirmId === sid(a._id)
                      ? <div className="flex gap-1 shrink-0">
                          <button onClick={() => setConfirmId(null)} className="text-xs px-2 py-1 rounded-lg bg-slate-700 text-slate-300">No</button>
                          <button onClick={() => { onRemove(a._id); setConfirmId(null); }} className="text-xs px-2 py-1 rounded-lg bg-rose-500 text-white">Sí</button>
                        </div>
                      : <button onClick={() => setConfirmId(sid(a._id))} className="text-slate-600 hover:text-rose-400 shrink-0 transition"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
              );
            })
        }
      </div>
    </div>
  );
}

/* ============================================================================
   CANJEAR PREMIOS — cliente muestra su código, staff lo busca y confirma
   ========================================================================== */
function RewardsRedeemTab({ token }) {
  const [code, setCode] = useState("");
  const [redemption, setRedemption] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [storyPlatform, setStoryPlatform] = useState("instagram");
  const [storyHandle, setStoryHandle] = useState("");
  const [confirmedTagged, setConfirmedTagged] = useState(false);
  const [confirmedDisclosure, setConfirmedDisclosure] = useState(false);
  const [issuingStory, setIssuingStory] = useState(false);
  const [storyError, setStoryError] = useState("");
  const [issuedStory, setIssuedStory] = useState(null);
  const [storyShareStatus, setStoryShareStatus] = useState("");

  const claimUrl = issuedStory?.claimToken
    ? `${window.location.origin}/claim-reward?token=${encodeURIComponent(issuedStory.claimToken)}`
    : "";

  const issueStoryReward = async (e) => {
    e.preventDefault();
    if (!storyHandle.trim() || !confirmedTagged || !confirmedDisclosure || issuingStory) return;
    setIssuingStory(true);
    setStoryError("");
    setIssuedStory(null);
    setStoryShareStatus("");
    try {
      const r = await fetch(`${API_URL}/api/staff/rewards/social-story`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          platform: storyPlatform,
          handle: storyHandle.trim(),
          confirmedTagged,
          confirmedDisclosure,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const retryDate = data.nextEligibleAt
          ? ` Podrá participar de nuevo el ${new Date(data.nextEligibleAt).toLocaleDateString("es-MX")}.`
          : "";
        throw new Error(`${data.msg || "No se pudo generar el premio"}${retryDate}`);
      }
      setIssuedStory({ ...data.redemption, claimToken: data.claimToken });
      setStoryHandle("");
      setConfirmedTagged(false);
      setConfirmedDisclosure(false);
    } catch (err) {
      setStoryError(err.message);
    } finally {
      setIssuingStory(false);
    }
  };

  const copyStoryCode = async () => {
    if (!issuedStory?.code) return;
    try {
      await navigator.clipboard.writeText(issuedStory.code);
      setStoryShareStatus("Código copiado");
    } catch {
      setStoryShareStatus("No se pudo copiar; anota el código manualmente");
    }
  };

  const shareStoryReward = async () => {
    if (!issuedStory || !claimUrl) return;
    const text = `Tu bebida de Poke Palace ya está lista. Guarda el premio en tu cuenta: ${claimUrl} Código de respaldo: ${issuedStory.code}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "Premio Poke Palace", text });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      }
      setStoryShareStatus("Enlace listo para compartir");
    } catch (err) {
      if (err.name !== "AbortError") setStoryShareStatus("No se pudo compartir el enlace");
    }
  };

  const lookup = async (e) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError("");
    setRedemption(null);
    try {
      const r = await fetch(`${API_URL}/api/staff/rewards/${clean}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.msg || "Código no encontrado");
      setRedemption(data.redemption);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setCode(""); setRedemption(null); setError(""); };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-lg font-bold text-white">Premio por historia</h2>
        <p className="text-slate-400 text-sm mt-1 mb-4">
          Verifica la publicación en el teléfono del cliente. La cuenta social se registra sólo para respetar el límite de una promoción cada 30 días; no es su usuario de Poke Palace.
        </p>

        <form onSubmit={issueStoryReward} className="bg-slate-900 rounded-2xl border border-white/5 p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-slate-300">
              Red social
              <select
                value={storyPlatform}
                onChange={(e) => { setStoryPlatform(e.target.value); setStoryError(""); setIssuedStory(null); }}
                className="mt-1.5 w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-emerald-500/50"
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
              </select>
            </label>
            <label className="text-sm text-slate-300">
              Cuenta donde publicó la historia
              <input
                value={storyHandle}
                onChange={(e) => { setStoryHandle(e.target.value); setStoryError(""); setIssuedStory(null); }}
                placeholder={storyPlatform === "facebook" ? "Usuario de Facebook" : "@cuenta_de_instagram"}
                maxLength={51}
                autoComplete="off"
                className="mt-1.5 w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
              />
              <span className="block mt-1.5 text-xs text-slate-500">Debe ser la misma cuenta que aparece en la historia activa.</span>
            </label>
          </div>

          <label className="flex items-start gap-3 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmedTagged}
              onChange={(e) => { setConfirmedTagged(e.target.checked); setStoryError(""); }}
              className="mt-0.5 w-4 h-4 accent-emerald-500"
            />
            <span>La historia está activa, muestra el producto y etiqueta la cuenta oficial de Poke Palace.</span>
          </label>
          <label className="flex items-start gap-3 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmedDisclosure}
              onChange={(e) => { setConfirmedDisclosure(e.target.checked); setStoryError(""); }}
              className="mt-0.5 w-4 h-4 accent-emerald-500"
            />
            <span>La historia indica que es una promoción, por ejemplo con #PromocionPokePalace.</span>
          </label>

          <button
            type="submit"
            disabled={issuingStory || !storyHandle.trim() || !confirmedTagged || !confirmedDisclosure}
            className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:hover:bg-violet-600 text-white font-semibold transition"
          >
            {issuingStory ? "Generando…" : "Generar código de bebida"}
          </button>
        </form>

        {storyError && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl px-4 py-3 mt-3">
            {storyError}
          </div>
        )}

        {issuedStory && (
          <div className="mt-3 bg-violet-500/10 border border-violet-500/20 rounded-2xl p-5">
            <div className="text-center">
              <p className="text-violet-300 text-sm font-semibold">Código generado para {issuedStory.socialHandle}</p>
              <p className="my-2 text-3xl font-mono font-bold tracking-widest text-white">{issuedStory.code}</p>
              <p className="text-slate-400 text-xs">
                Agua de coco o limonada de matcha. Válido hasta el {new Date(issuedStory.expiresAt).toLocaleDateString("es-MX")} con la compra de un bowl.
              </p>
            </div>

            {claimUrl && (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-center bg-slate-950/60 rounded-2xl border border-white/10 p-4">
                <div className="mx-auto rounded-xl overflow-hidden leading-none">
                  <RewardQrCode value={claimUrl} size={180} />
                </div>
                <div>
                  <div className="flex items-center gap-2 text-white font-semibold">
                    <QrCode size={19} aria-hidden="true" /> Guardar en la cuenta del cliente
                  </div>
                  <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                    Pide al cliente escanear este QR. Si inicia sesión o crea una cuenta, el premio aparecerá automáticamente en “Mis premios”.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                    <button type="button" onClick={copyStoryCode} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2.5 text-sm font-semibold text-white transition">
                      <Copy size={16} aria-hidden="true" /> Copiar código
                    </button>
                    <button type="button" onClick={shareStoryReward} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-white transition">
                      <Share2 size={16} aria-hidden="true" /> Compartir enlace
                    </button>
                  </div>
                  {storyShareStatus && <p className="text-emerald-300 text-xs mt-2" role="status">{storyShareStatus}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 pt-6">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-white">Canjear premios</h2>
        <p className="text-slate-400 text-sm mt-1">
          Pide al cliente el código de 6 caracteres que le aparece en su cuenta y búscalo aquí.
        </p>
      </div>

      <form onSubmit={lookup} className="flex gap-2 mb-4">
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setRedemption(null); setError(""); }}
          placeholder="Ej. A3K9QZ"
          maxLength={6}
          className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-mono tracking-widest text-center uppercase placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
        />
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-semibold transition"
        >
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {redemption && (
        <div className="bg-slate-900 rounded-2xl border border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-2xl font-mono font-bold tracking-widest text-white">{redemption.code}</span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              redemption.status === "used"    ? "bg-slate-500/20 text-slate-400"
              : redemption.status === "expired" ? "bg-rose-500/20 text-rose-400"
              : "bg-emerald-500/20 text-emerald-400"
            }`}>
              {redemption.status === "used" ? "Ya usado" : redemption.status === "expired" ? "Vencido" : "Activo"}
            </span>
          </div>

          <div className="space-y-1.5 mb-5">
            <p className="text-white font-semibold">{redemption.rewardName}</p>
            <p className="text-slate-400 text-sm">
              {redemption.source === "social_story"
                ? `${redemption.socialPlatform === "facebook" ? "Facebook" : "Instagram"}: ${redemption.socialHandle}`
                : `Cliente: ${redemption.user?.name || "—"} · ${redemption.pointsCost} pts`}
            </p>
            {redemption.status === "used" && (
              <p className="text-slate-500 text-xs">
                Usado el {new Date(redemption.usedAt).toLocaleString("es-MX")}
              </p>
            )}
            {redemption.status === "expired" && (
              <p className="text-rose-400 text-xs">
                Venció el {new Date(redemption.expiresAt).toLocaleDateString("es-MX")}
              </p>
            )}
            {redemption.status === "active" && redemption.expiresAt && (
              <p className="text-slate-500 text-xs">
                Válido hasta el {new Date(redemption.expiresAt).toLocaleDateString("es-MX")}
              </p>
            )}
          </div>

          {redemption.status === "active" ? (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-amber-300 text-sm">
              Aplica este código dentro de la orden en la pestaña POS. El sistema verificará las condiciones y calculará el descuento.
            </div>
          ) : (
            <button
              onClick={reset}
              className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-semibold transition"
            >
              Buscar otro código
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

/* ============================================================================
   DISPONIBILIDAD DE INGREDIENTES
   ========================================================================== */
const AVAIL_CATEGORIES = [
  { label: "Bases",        items: Object.entries(BASE_LABELS).map(([id, label]) => ({ id, label })) },
  { label: "Proteínas",    items: Object.entries(PROTEIN_LABELS).map(([id, label]) => ({ id, label })) },
  { label: "Marinados",    items: Object.entries(MARINADE_LABELS).map(([id, label]) => ({ id, label })) },
  { label: "Complementos", items: Object.entries(COMPLEMENT_LABELS).map(([id, label]) => ({ id, label })) },
  { label: "Salsas",       items: Object.entries(SAUCE_LABELS).map(([id, label]) => ({ id, label })) },
  { label: "Toppings",     items: Object.entries(TOPPING_LABELS).map(([id, label]) => ({ id, label })) },
];

function AvailabilityTab({ token, role }) {
  const [unavailable, setUnavailable] = useState(null); // null = loading
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState("");

  const [storeStatus, setStoreStatus] = useState(null); // { ordersPaused, pausedMessage }
  const [pauseSaving, setPauseSaving] = useState(false);
  const [pauseMsgDraft, setPauseMsgDraft] = useState("");

  // Respaldo de datos — solo dueño/admin
  const canBackup = role === "owner" || role === "admin";
  const [backupInfo, setBackupInfo]   = useState(null); // { lastBackupAt }
  const [backupBusy, setBackupBusy]   = useState(false);
  const [backupError, setBackupError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/settings/availability`)
      .then((r) => r.json())
      .then((d) => setUnavailable(d.unavailableItems ?? []))
      .catch(() => setUnavailable([]));

    fetch(`${API_URL}/api/settings/store-status`)
      .then((r) => r.json())
      .then((d) => { setStoreStatus(d); setPauseMsgDraft(d.pausedMessage || ""); })
      .catch(() => setStoreStatus({ ordersPaused: false, pausedMessage: "" }));
  }, []);

  useEffect(() => {
    if (!canBackup) return;
    fetch(`${API_URL}/api/staff/backup/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setBackupInfo({ lastBackupAt: d.lastBackupAt || null }))
      .catch(() => setBackupInfo({ lastBackupAt: null }));
  }, [canBackup, token]);

  const downloadBackup = async () => {
    setBackupBusy(true);
    setBackupError("");
    try {
      const r = await fetch(`${API_URL}/api/staff/backup`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("No se pudo generar el respaldo. Intenta de nuevo.");
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pokepalace_respaldo_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBackupInfo({ lastBackupAt: data.exportedAt });
    } catch (e) {
      setBackupError(e.message);
    } finally {
      setBackupBusy(false);
    }
  };

  const daysSinceBackup = backupInfo?.lastBackupAt
    ? Math.floor((Date.now() - new Date(backupInfo.lastBackupAt).getTime()) / 86400000)
    : null;
  const backupOverdue = canBackup && backupInfo && (daysSinceBackup === null || daysSinceBackup >= 7);

  const togglePause = async () => {
    const next = { ordersPaused: !storeStatus.ordersPaused, pausedMessage: pauseMsgDraft };
    setStoreStatus(next);
    setPauseSaving(true);
    try {
      await fetch(`${API_URL}/api/settings/store-status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(next),
      });
    } catch {
      setSaveError("Error al guardar. Intenta de nuevo.");
    } finally {
      setPauseSaving(false);
    }
  };

  const savePauseMessage = async () => {
    setPauseSaving(true);
    try {
      await fetch(`${API_URL}/api/settings/store-status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ordersPaused: storeStatus.ordersPaused, pausedMessage: pauseMsgDraft }),
      });
      setStoreStatus((p) => ({ ...p, pausedMessage: pauseMsgDraft }));
    } catch {
      setSaveError("Error al guardar. Intenta de nuevo.");
    } finally {
      setPauseSaving(false);
    }
  };

  const toggle = async (id) => {
    const next = unavailable.includes(id)
      ? unavailable.filter((x) => x !== id)
      : [...unavailable, id];
    setUnavailable(next);
    setSaving(true);
    try {
      await fetch(`${API_URL}/api/settings/availability`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ unavailableItems: next }),
      });
    } catch {
      setSaveError("Error al guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const unavailableCount = unavailable?.length ?? 0;

  if (unavailable === null || storeStatus === null) {
    return <p className="text-slate-400 text-sm mt-4">Cargando…</p>;
  }

  return (
    <div>
      {/* Pausar pedidos en línea */}
      <div className={`mb-6 rounded-2xl border p-4 ${storeStatus.ordersPaused ? "bg-rose-500/10 border-rose-500/30" : "bg-slate-900 border-white/5"}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Pedidos en línea</h2>
            <p className={`text-sm mt-1 ${storeStatus.ordersPaused ? "text-rose-400 font-semibold" : "text-slate-400"}`}>
              {storeStatus.ordersPaused ? "⏸ Pausados — los clientes no pueden ordenar ahora" : "Activos — la tienda acepta pedidos normalmente"}
            </p>
          </div>
          <button
            onClick={togglePause}
            disabled={pauseSaving}
            className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold transition ${
              storeStatus.ordersPaused
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "bg-rose-600 hover:bg-rose-500 text-white"
            } disabled:opacity-50`}
          >
            {pauseSaving ? "Guardando…" : storeStatus.ordersPaused ? "Reanudar pedidos" : "Pausar pedidos"}
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-white/5">
          <label className="text-xs text-slate-400 uppercase tracking-widest mb-1.5 block">
            Mensaje para el cliente (opcional)
          </label>
          <div className="flex gap-2">
            <input
              value={pauseMsgDraft}
              onChange={(e) => setPauseMsgDraft(e.target.value)}
              placeholder="Ej. Cerrado temporalmente por alta demanda, regresamos en 30 min"
              maxLength={200}
              className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
            />
            <button
              onClick={savePauseMessage}
              disabled={pauseSaving}
              className="shrink-0 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>

      {/* Respaldo de datos — solo dueño/admin */}
      {canBackup && (
        <div className={`mb-6 rounded-2xl border p-4 ${backupOverdue ? "bg-amber-500/10 border-amber-500/30" : "bg-slate-900 border-white/5"}`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-white">💾 Respaldo de datos</h2>
              <p className={`text-sm mt-1 ${backupOverdue ? "text-amber-400 font-semibold" : "text-slate-400"}`}>
                {backupInfo === null
                  ? "Consultando…"
                  : daysSinceBackup === null
                  ? "⚠ Nunca se ha descargado un respaldo"
                  : daysSinceBackup === 0
                  ? "Último respaldo: hoy"
                  : daysSinceBackup >= 7
                  ? `⚠ Último respaldo hace ${daysSinceBackup} días — descarga uno nuevo`
                  : `Último respaldo hace ${daysSinceBackup} día${daysSinceBackup > 1 ? "s" : ""}`}
              </p>
            </div>
            <button
              onClick={downloadBackup}
              disabled={backupBusy}
              className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold transition text-white disabled:opacity-50 ${
                backupOverdue ? "bg-amber-600 hover:bg-amber-500" : "bg-slate-700 hover:bg-slate-600"
              }`}
            >
              {backupBusy ? "Generando…" : "⬇ Descargar respaldo"}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-white/5">
            Descarga un archivo con toda la información del negocio (órdenes, clientes, inventario, checadas, gastos…).
            Guárdalo en un lugar seguro — por ejemplo tu Google Drive — al menos una vez por semana.
          </p>
          {backupError && <p className="text-rose-400 text-xs mt-2">{backupError}</p>}
        </div>
      )}

      <div className="mb-5">
        <h2 className="text-lg font-bold text-white">Disponibilidad de ingredientes</h2>
        <p className="text-slate-400 text-sm mt-1">
          Marca un ingrediente como <span className="text-rose-400 font-semibold">Agotado</span> para que no aparezca en el builder de bowls.
          {unavailableCount > 0 && (
            <span className="ml-2 bg-rose-500/20 text-rose-400 text-xs font-semibold px-2 py-0.5 rounded-full">
              {unavailableCount} agotado{unavailableCount > 1 ? "s" : ""}
            </span>
          )}
        </p>
        {saving    && <p className="text-amber-400 text-xs mt-2">Guardando…</p>}
        {saveError && <p className="text-rose-400 text-xs mt-2">{saveError}</p>}
      </div>

      <div className="space-y-4">
        {AVAIL_CATEGORIES.map((cat) => (
          <div key={cat.label} className="bg-slate-900 rounded-2xl border border-white/5 overflow-hidden">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-4 py-2.5 border-b border-white/5">
              {cat.label}
            </p>
            <div className="divide-y divide-white/5">
              {cat.items.map((item) => {
                const isAvailable = !unavailable.includes(item.id);
                return (
                  <div key={item.id} className="flex items-center justify-between px-4 py-3">
                    <span className={`text-sm ${isAvailable ? "text-white" : "text-slate-500 line-through"}`}>
                      {item.label}
                    </span>
                    <button
                      onClick={() => toggle(item.id)}
                      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${isAvailable ? "bg-emerald-600" : "bg-slate-600"}`}
                      aria-label={isAvailable ? "Marcar como agotado" : "Marcar como disponible"}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${isAvailable ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   PANEL — ASISTENCIA + EQUIPO
   ========================================================================== */
function PanelTab({ employees, time, now, onAddEmployee, onRemoveEmployee, onUpdateEmployee }) {
  const [view, setView] = useState("hoy");
  const empById = (id) => employees.find((e) => sid(e._id) === sid(id));
  const weekAgo = Date.now() - 7 * 86400000;
  const weekEntries = time.filter((t) => new Date(t.clockIn).getTime() >= weekAgo);

  const breakMinsOf = (t) => (t.breaks || []).reduce((bAcc, b) => {
    const bStart = new Date(b.start).getTime();
    const bEnd = b.end ? new Date(b.end).getTime() : now;
    return bAcc + (bEnd - bStart) / 60000;
  }, 0);

  const hoursByEmp = employees.map((e) => {
    const entries = weekEntries.filter((t) => sid(t.employeeId) === sid(e._id));
    const mins = entries.reduce((acc, t) => {
      const start = new Date(t.clockIn).getTime();
      const grossMins = ((t.clockOut ? new Date(t.clockOut).getTime() : now) - start) / 60000;
      return acc + Math.max(0, grossMins - breakMinsOf(t));
    }, 0);
    return { emp: e, mins, open: entries.some((t) => !t.clockOut) };
  });

  const activeNow = hoursByEmp.filter((h) => h.open);
  const payFor = (emp, mins) => emp.payType === "weekly" ? (emp.weeklySalary || 0) : (mins / 60) * (emp.hourlyRate || 0);
  const totalPayroll = hoursByEmp.reduce((s, { emp, mins }) => s + payFor(emp, mins), 0);

  function exportCSV() {
    const rows = [["Empleado","Rol","Fecha","Entrada","Salida","Minutos lonche","Minutos netos"]];
    time.forEach((t) => {
      const e = empById(t.employeeId);
      const breakMins = Math.round(breakMinsOf(t));
      const netMins = t.clockOut
        ? Math.round(Math.max(0, (new Date(t.clockOut).getTime() - new Date(t.clockIn).getTime()) / 60000 - breakMins))
        : "";
      rows.push([e?.name||"?", e?.role||"", t.date, fmtTime(t.clockIn), t.clockOut ? fmtTime(t.clockOut) : "en curso",
        breakMins || 0, netMins]);
    });
    downloadCSV(`horas_${todayKey()}.csv`, rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-black tracking-tight">Panel</h2><p className="text-sm text-slate-400 mt-0.5">Asistencia y gestión del equipo.</p></div>
        <button onClick={exportCSV} className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold transition"><Download className="w-4 h-4" /> CSV</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[["text-emerald-400", activeNow.length, "En turno"], ["text-white", employees.length, "Empleados"], ["text-amber-400", time.filter(t=>t.date===todayKey()).length, "Registros hoy"]].map(([cls, val, label]) => (
          <div key={label} className="bg-slate-800 rounded-2xl border border-white/5 p-3 text-center">
            <p className={`text-2xl font-black ${cls}`}>{val}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {[["hoy","Ahora"],["semana","7 días"],["nomina","Nómina"],["equipo","Equipo"]].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition ${view===id?"bg-emerald-600 text-white border-emerald-500":"bg-slate-800 text-slate-400 border-white/5"}`}>
            {label}
          </button>
        ))}
      </div>

      {view === "hoy" && (
        <div className="space-y-3">
          {activeNow.length === 0
            ? <div className="text-center py-10 bg-slate-800 rounded-2xl border border-white/5"><User className="w-8 h-8 mx-auto mb-2 text-slate-600" /><p className="text-slate-500 text-sm">Nadie tiene turno activo ahora.</p></div>
            : activeNow.map(({ emp }) => {
                const oe = time.find((t) => sid(t.employeeId) === sid(emp._id) && !t.clockOut);
                const col = getColor(emp.color);
                return (
                  <div key={sid(emp._id)} className="bg-slate-800 rounded-2xl border border-white/5 p-4 flex items-center gap-3">
                    <span className={`w-11 h-11 rounded-xl ${col.bg} flex items-center justify-center font-bold text-white`}>{initials(emp.name)}</span>
                    <div className="flex-1"><p className="font-semibold text-sm">{emp.name}</p><p className="text-xs text-slate-400 capitalize">{ROLE_LABEL[emp.role]||emp.role}</p></div>
                    <div className="text-right">
                      <span className="flex items-center gap-1 text-emerald-400 text-xs justify-end mb-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> activo</span>
                      <p className="text-sm font-bold tabular-nums">{fmtHM((now - new Date(oe.clockIn).getTime()) / 60000)}</p>
                    </div>
                  </div>
                );
              })
          }
        </div>
      )}

      {view === "semana" && (
        <div className="bg-slate-800 rounded-2xl border border-white/5 divide-y divide-white/5">
          {hoursByEmp.sort((a,b)=>b.mins-a.mins).map(({ emp, mins, open }) => {
            const col = getColor(emp.color);
            return (
              <div key={sid(emp._id)} className="flex items-center gap-3 p-4">
                <span className={`w-9 h-9 rounded-xl ${col.bg} flex items-center justify-center text-xs font-bold text-white shrink-0`}>{initials(emp.name)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="font-semibold text-sm truncate">{emp.name.split(" ")[0]}</p>
                    {open && <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">activo</span>}
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full ${col.bg} rounded-full`} style={{ width:`${Math.min(100,(mins/(40*60))*100)}%` }} />
                  </div>
                </div>
                <p className="text-sm font-bold tabular-nums shrink-0">{fmtHM(mins)}</p>
              </div>
            );
          })}
        </div>
      )}

      {view === "nomina" && (
        <PayrollView hoursByEmp={hoursByEmp} totalPayroll={totalPayroll} onUpdate={onUpdateEmployee} />
      )}

      {view === "equipo" && <TeamManager employees={employees} onAdd={onAddEmployee} onRemove={onRemoveEmployee} onUpdate={onUpdateEmployee} />}
    </div>
  );
}

function PayrollView({ hoursByEmp, totalPayroll, onUpdate }) {
  const [editId, setEditId]     = useState(null);
  const [editType, setEditType] = useState("hourly");
  const [editRate, setEditRate] = useState("");
  const [editSalary, setEditSalary] = useState("");
  const [saving, setSaving]     = useState(false);

  const payFor = (emp, mins) => emp.payType === "weekly" ? (emp.weeklySalary || 0) : (mins / 60) * (emp.hourlyRate || 0);

  const startEdit = (emp) => {
    setEditId(emp._id);
    setEditType(emp.payType === "weekly" ? "weekly" : "hourly");
    setEditRate(String(emp.hourlyRate || ""));
    setEditSalary(String(emp.weeklySalary || ""));
  };

  const saveRate = async (emp) => {
    setSaving(true);
    try {
      await onUpdate(emp._id, {
        payType: editType,
        hourlyRate: parseFloat(editRate) || 0,
        weeklySalary: parseFloat(editSalary) || 0,
      });
      setEditId(null);
    } catch { /* silently ignore */ }
    finally { setSaving(false); }
  };

  function exportCSV() {
    const rows = [["Empleado", "Rol", "Tipo de pago", "Horas trabajadas", "Sueldo/hora", "Sueldo semanal fijo", "Pago estimado"]];
    hoursByEmp.forEach(({ emp, mins }) => {
      const hours = mins / 60;
      rows.push([
        emp.name, ROLE_LABEL[emp.role] || emp.role,
        emp.payType === "weekly" ? "Semanal fijo" : "Por hora",
        hours.toFixed(2), emp.hourlyRate || 0, emp.weeklySalary || 0,
        payFor(emp, mins).toFixed(2),
      ]);
    });
    rows.push([]);
    rows.push(["Total nómina", "", "", "", "", "", totalPayroll.toFixed(2)]);
    downloadCSV(`nomina_${todayKey()}.csv`, rows);
  }

  return (
    <div className="space-y-3">
      <div className="bg-slate-800 rounded-2xl border border-emerald-500/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Nómina estimada — últimos 7 días</p>
            <p className="text-3xl font-black text-emerald-400">${totalPayroll.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} MXN</p>
            <p className="text-xs text-slate-500 mt-1">Por hora según turnos, o sueldo semanal fijo si así está configurado</p>
          </div>
          <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-semibold transition shrink-0">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl border border-white/5 divide-y divide-white/5">
        {hoursByEmp.map(({ emp, mins }) => {
          const pay   = payFor(emp, mins);
          const col   = getColor(emp.color);
          const isEditing = editId === emp._id;
          return (
            <div key={sid(emp._id)} className={isEditing ? "p-4" : "flex items-center gap-3 p-4"}>
              {isEditing ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <span className={`w-9 h-9 rounded-xl ${col.bg} flex items-center justify-center text-xs font-bold text-white shrink-0`}>
                      {initials(emp.name)}
                    </span>
                    <p className="font-semibold text-sm truncate">{emp.name.split(" ")[0]}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setEditType("hourly")}
                      className={`flex-1 text-xs font-semibold py-2 rounded-lg transition ${editType === "hourly" ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400"}`}>
                      Por hora
                    </button>
                    <button onClick={() => setEditType("weekly")}
                      className={`flex-1 text-xs font-semibold py-2 rounded-lg transition ${editType === "weekly" ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400"}`}>
                      Semanal fijo
                    </button>
                  </div>
                  {editType === "hourly" ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">$</span>
                      <input type="number" min="0" step="10" value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveRate(emp); if (e.key === "Escape") setEditId(null); }}
                        autoFocus
                        className="flex-1 bg-slate-700 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white text-right focus:outline-none focus:border-emerald-500 font-mono"
                        placeholder="0"
                      />
                      <span className="text-xs text-slate-400">/hora</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">$</span>
                      <input type="number" min="0" step="50" value={editSalary}
                        onChange={(e) => setEditSalary(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveRate(emp); if (e.key === "Escape") setEditId(null); }}
                        autoFocus
                        className="flex-1 bg-slate-700 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white text-right focus:outline-none focus:border-emerald-500 font-mono"
                        placeholder="0"
                      />
                      <span className="text-xs text-slate-400">/semana</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setEditId(null)} className="flex-1 text-xs text-slate-300 bg-slate-700 hover:bg-slate-600 py-2 rounded-lg transition">Cancelar</button>
                    <button onClick={() => saveRate(emp)} disabled={saving}
                      className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-lg transition">
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className={`w-9 h-9 rounded-xl ${col.bg} flex items-center justify-center text-xs font-bold text-white shrink-0`}>
                    {initials(emp.name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{emp.name.split(" ")[0]}</p>
                    <p className="text-[11px] text-slate-500">{fmtHM(mins)} trabajadas</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      {emp.payType === "weekly" && emp.weeklySalary > 0 ? (
                        <>
                          <p className="text-sm font-bold">${pay.toLocaleString("es-MX", { maximumFractionDigits: 0 })}</p>
                          <p className="text-[10px] text-slate-500">${emp.weeklySalary}/semana fijo</p>
                          {emp.hourlyRate > 0 && (
                            <p className="text-[10px] text-emerald-400/80">≈${emp.hourlyRate}/hora efectivo</p>
                          )}
                        </>
                      ) : emp.hourlyRate > 0 ? (
                        <>
                          <p className="text-sm font-bold">${pay.toLocaleString("es-MX", { maximumFractionDigits: 0 })}</p>
                          <p className="text-[10px] text-slate-500">${emp.hourlyRate}/hr</p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-500 italic">Sin tarifa</p>
                      )}
                    </div>
                    <button onClick={() => startEdit(emp)}
                      className="text-[10px] text-slate-500 hover:text-emerald-400 bg-white/5 hover:bg-white/10 px-2 py-1 rounded-lg transition">
                      Editar
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 text-center">Toca &quot;Editar&quot; en cada empleado para configurar su sueldo por hora (MXN).</p>
    </div>
  );
}

function TeamManager({ employees, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", role: "employee", pin: "", color: "emerald", hourlyRate: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  async function handleAdd() {
    if (!form.name.trim()) return setError("Escribe el nombre");
    if (form.pin.length !== 4) return setError("El PIN debe tener 4 dígitos");
    setError(""); setSaving(true);
    try {
      await onAdd({ ...form, hourlyRate: parseFloat(form.hourlyRate) || 0 });
      setForm({ name:"", role:"employee", pin:"", color:"emerald", hourlyRate:"" });
      setAdding(false);
    }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <div className="bg-emerald-900/30 border border-emerald-700/30 rounded-2xl p-4">
        <p className="text-xs font-semibold text-emerald-400 mb-2">💡 Tip — 3 socios, 2 días cada uno</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Socio 1","Lun · Mar"],["Socio 2","Mié · Jue"],["Socio 3","Vie · Sáb"]].map(([s,d]) => (
            <div key={s} className="bg-slate-900/60 rounded-xl py-2">
              <p className="text-[10px] text-slate-400">{s}</p>
              <p className="text-xs font-bold mt-0.5">{d}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl border border-white/5 divide-y divide-white/5">
        {employees.map((e) => {
          const col = getColor(e.color);
          return (
            <div key={sid(e._id)} className="flex items-center gap-3 p-4">
              <span className={`w-10 h-10 rounded-xl ${col.bg} flex items-center justify-center text-sm font-bold text-white shrink-0`}>{initials(e.name)}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{e.name}</p>
                <p className={`text-xs ${col.text}`}>{ROLE_LABEL[e.role]||e.role}</p>
                {e.hourlyRate > 0 && <p className="text-[10px] text-slate-500 mt-0.5">${e.hourlyRate}/hr</p>}
              </div>
              {confirmId === sid(e._id)
                ? <div className="flex gap-1 shrink-0">
                    <button onClick={() => setConfirmId(null)} className="text-xs px-2 py-1.5 rounded-lg bg-slate-700 text-slate-300">No</button>
                    <button onClick={() => { onRemove(e._id); setConfirmId(null); }} className="text-xs px-2 py-1.5 rounded-lg bg-rose-500 text-white font-semibold">Eliminar</button>
                  </div>
                : <button onClick={() => setConfirmId(sid(e._id))} className="text-slate-600 hover:text-rose-400 transition shrink-0"><Trash2 className="w-4 h-4" /></button>
              }
            </div>
          );
        })}
      </div>

      {adding ? (
        <div className="bg-slate-800 rounded-2xl border border-emerald-500/30 p-4 space-y-3">
          <p className="text-sm font-bold">Nuevo integrante</p>
          <input value={form.name} onChange={(e) => setForm({...form, name:e.target.value})} placeholder="Nombre completo"
            className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.role} onChange={(e) => setForm({...form, role:e.target.value})}
              className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500">
              <option value="employee">Empleado/a</option>
              <option value="cashier">Cajero/a</option>
              <option value="kitchen">Cocina</option>
              <option value="manager">Gerente</option>
              <option value="owner">Dueño/a · Socio</option>
            </select>
            <input value={form.pin} inputMode="numeric" placeholder="PIN (4 dígitos)"
              onChange={(e) => setForm({...form, pin:e.target.value.replace(/\D/g,"").slice(0,4)})}
              className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 tracking-widest" />
          </div>
          <input value={form.hourlyRate} type="number" min="0" step="10" inputMode="decimal"
            onChange={(e) => setForm({...form, hourlyRate:e.target.value})}
            placeholder="Sueldo por hora (MXN) — opcional"
            className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
          <div>
            <p className="text-xs text-slate-400 mb-2">Color de avatar</p>
            <div className="flex gap-2 flex-wrap">
              {COLOR_KEYS.map((c) => (
                <button key={c} onClick={() => setForm({...form, color:c})}
                  className={`w-8 h-8 rounded-lg ${COLORS[c].bg} transition-all ${form.color===c?"ring-2 ring-offset-2 ring-offset-slate-800 ring-white scale-110":"opacity-60 hover:opacity-100"}`} />
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setAdding(false); setError(""); }} className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold transition">Cancelar</button>
            <button onClick={handleAdd} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition disabled:opacity-50">
              {saving ? "Guardando…" : "Agregar"}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-2xl py-4 text-sm text-slate-500 hover:text-emerald-400 transition">
          <Plus className="w-4 h-4" /> Agregar integrante
        </button>
      )}
    </div>
  );
}

/* ============================================================================
   BOTTOM NAV
   ========================================================================== */
function BottomNav({ tab, setTab, tabs, openEntry, lowStockCount }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 bg-slate-900/95 backdrop-blur border-t border-white/5">
      <div className="max-w-5xl mx-auto flex justify-around px-2 py-2 overflow-x-auto">
        {tabs.map((id) => {
          const { label, icon: Icon } = TAB_META[id];
          const isActive = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all relative shrink-0 ${isActive ? "text-emerald-400" : "text-slate-500 hover:text-slate-300"}`}>
              {id === "inicio" && openEntry && (
                <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
              {id === "inv" && lowStockCount > 0 && (
                <span className="absolute -top-0.5 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {lowStockCount > 9 ? "9+" : lowStockCount}
                </span>
              )}
              <Icon className={`w-5 h-5 ${isActive ? "scale-110" : ""} transition-transform`} />
              <span className={`text-[10px] font-medium whitespace-nowrap ${isActive ? "text-emerald-400" : ""}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

