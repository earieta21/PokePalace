import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { StaffAuthContext } from "../context/StaffAuthContext";
import styles from "./EmployeePortal.module.css";

// Page components
import KDSPage from "./pages/KDSPage";
import StockPage from "./pages/StockPage";
import PrepPage from "./pages/PrepPage";
import POSPage from "./pages/POSPage";
import ActiveOrdersPage from "./pages/ActiveOrdersPage";
import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import WastePage from "./pages/WastePage";
import AllOrdersPage from "./pages/AllOrdersPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import EmployeesPage from "./pages/EmployeesPage";
import AuditPage from "./pages/AuditPage";
import FinancePage from "./pages/FinancePage";
import SchedulePage from "./pages/SchedulePage";

/* ── Page registry ── */
const PAGE_MAP = {
  kds:   { label: "Pantalla de Cocina",  Component: KDSPage },
  stk:   { label: "Stock",               Component: StockPage },
  prep:  { label: "Preparación",         Component: PrepPage },
  pos:   { label: "Punto de Venta",      Component: POSPage },
  orc:   { label: "Órdenes Activas",     Component: ActiveOrdersPage },
  dash:  { label: "Panel",               Component: DashboardPage },
  inv:   { label: "Inventario",          Component: InventoryPage },
  waste: { label: "Registro de Merma",   Component: WastePage },
  orm:   { label: "Todas las Órdenes",   Component: AllOrdersPage },
  anal:  { label: "Análisis",            Component: AnalyticsPage },
  emp:   { label: "Empleados",           Component: EmployeesPage },
  audit: { label: "Auditoría",           Component: AuditPage },
  fin:   { label: "Finanzas",            Component: FinancePage },
  sched: { label: "Horarios",            Component: SchedulePage },
};

/* ── Nav items per role ── */
const NAV_BY_ROLE = {
  kitchen: ["kds", "stk", "prep"],
  cashier: ["pos", "orc"],
  manager: ["dash", "inv", "waste", "orm", "audit", "sched"],
  admin:   ["dash", "inv", "waste", "orm", "anal", "emp", "audit", "fin"],
  owner:   ["dash", "inv", "waste", "orm", "anal", "emp", "audit", "fin"],
};

/* ── Live clock hook ── */
function useClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/* ── Helpers ── */
function initials(user) {
  const src = user?.name || user?.email || "?";
  return src
    .split(/[\s@]+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function displayName(user) {
  return user?.name || user?.email?.split("@")[0] || "Staff";
}

/* ═══════════════════════════════════
   EMPLOYEE PORTAL — main component
═══════════════════════════════════ */
export default function EmployeePortal() {
  const { staffUser, isStaffLoggedIn, staffLogout } = useContext(StaffAuthContext);
  const navigate = useNavigate();
  const time = useClock();

  const role = staffUser?.role ?? "cashier";
  const navIds = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.cashier;
  const [activeId, setActiveId] = useState(() => navIds[0]);

  // Redirect unauthenticated visitors to staff login
  useEffect(() => {
    if (!isStaffLoggedIn) navigate("/staff/login", { replace: true });
  }, [isStaffLoggedIn, navigate]);

  // The customer site adds padding-bottom:90px for its sticky navbar.
  // Remove it for the portal so the layout isn't offset.
  useEffect(() => {
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "0";
    return () => { document.body.style.paddingBottom = prev; };
  }, []);

  if (!isStaffLoggedIn || !staffUser) return null;

  // Ensure activeId is always a page this role can see
  const safeId = navIds.includes(activeId) ? activeId : navIds[0];
  const { Component: ActivePage, label: activeLabel } = PAGE_MAP[safeId];

  const ini = initials(staffUser);
  const name = displayName(staffUser);

  const handleLogout = () => {
    staffLogout();
    navigate("/staff/login");
  };

  return (
    <div className={styles.portal}>
      {/* ────────── Sidebar ────────── */}
      <aside className={styles.sidebar}>
        {/* Brand */}
        <div className={styles.brand}>
          <p className={styles.brandName}>Poke Palace</p>
          <span className={styles.brandSub}>Portal del Personal</span>
          <span className={styles.roleBadge}>{role}</span>
        </div>

        {/* Navigation */}
        <nav className={styles.navSection} aria-label="Staff navigation">
          <span className={styles.navLabel}>Navegación</span>
          {navIds.map((id) => (
            <button
              key={id}
              className={`${styles.navBtn} ${id === safeId ? styles.navBtnActive : ""}`}
              onClick={() => setActiveId(id)}
              aria-current={id === safeId ? "page" : undefined}
            >
              <span className={styles.navDot} />
              <span className={styles.navBtnText}>{PAGE_MAP[id].label}</span>
            </button>
          ))}
        </nav>

        {/* Footer — user info + logout */}
        <div className={styles.sidebarFooter}>
          <div className={styles.userRow}>
            <div className={styles.userAvatarSm} aria-hidden="true">
              {ini}
            </div>
            <span className={styles.userNameSm}>{name}</span>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ────────── Right panel ────────── */}
      <div className={styles.rightPanel}>
        {/* Topbar */}
        <div className={styles.topbar}>
          <span className={styles.topbarTitle}>{activeLabel}</span>
          <div className={styles.topbarMeta}>
            <span className={styles.clock} aria-live="off">{time}</span>
            <div className={styles.userChip}>
              <div className={styles.userInitial} aria-hidden="true">{ini}</div>
              <span className={styles.userChipName}>{name}</span>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className={styles.main}>
          <ActivePage styles={styles} role={role} staffUser={staffUser} />
        </main>
      </div>
    </div>
  );
}
