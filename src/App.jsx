import React, { lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

// Customer pages — loaded eagerly (always needed)
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";

// Cada deploy le pone un hash nuevo al nombre de cada archivo. Una pestaña
// que quedó abierta desde antes del deploy sigue pidiendo el nombre viejo,
// que ya no existe, y la pagina truena con "Failed to fetch dynamically
// imported module" o "Unable to preload CSS" — que es exactamente lo que
// estaba pasando en /menu y /order. Recargar una vez trae el index.html
// nuevo con los nombres correctos.
//
// La marca en sessionStorage evita el bucle: si después de recargar el
// archivo sigue sin aparecer, el error se deja pasar al ErrorBoundary en vez
// de recargar para siempre. Se limpia al primer import exitoso para que un
// segundo deploy en la misma sesión tambien se recupere solo.
const lazyWithReload = (factory, key) =>
  lazy(() =>
    factory()
      .then((mod) => {
        try { sessionStorage.removeItem(`chunk-reload:${key}`); } catch { /* modo privado */ }
        return mod;
      })
      .catch((error) => {
        let alreadyReloaded = true;
        try {
          const flag = `chunk-reload:${key}`;
          alreadyReloaded = Boolean(sessionStorage.getItem(flag));
          if (!alreadyReloaded) sessionStorage.setItem(flag, "1");
        } catch { /* sin sessionStorage no se reintenta */ }
        if (alreadyReloaded) throw error;
        window.location.reload();
        // La página se está recargando: esta promesa no debe resolver nunca,
        // así React no alcanza a pintar nada mas.
        return new Promise(() => {});
      }),
  );

// Customer pages — lazy loaded
const MenuPage         = lazyWithReload(() => import("./pages/MenuPage"), "MenuPage");
const OrderPage        = lazyWithReload(() => import("./order/OrderPage"), "OrderPage");
const RewardsDeals     = lazyWithReload(() => import("./pages/Promotions"), "Promotions");
const EarnPoints       = lazyWithReload(() => import("./pages/EarnPoints"), "EarnPoints");
const MoreOptions      = lazyWithReload(() => import("./more/MoreOptions"), "MoreOptions");
const MiCuenta         = lazyWithReload(() => import("./pages/MiCuenta"), "MiCuenta");
const OrderSummaryPage = lazyWithReload(() => import("./pages/OrderSummaryPage"), "OrderSummaryPage");
const OrderTracking    = lazyWithReload(() => import("./pages/OrderTracking"), "OrderTracking");
const LocationPage     = lazyWithReload(() => import("./pages/LocationPage"), "LocationPage");
const QrCodePage       = lazyWithReload(() => import("./pages/QrCodePage"), "QrCodePage");
const ClaimRewardPage  = lazyWithReload(() => import("./pages/ClaimRewardPage"), "ClaimRewardPage");
const PrivacyPolicy    = lazyWithReload(() => import("./pages/PrivacyPolicy"), "PrivacyPolicy");
const TermsOfService   = lazyWithReload(() => import("./pages/TermsOfService"), "TermsOfService");
const KioskPair        = lazyWithReload(() => import("./pages/KioskPair"), "KioskPair");

// Kiosk & staff — lazy loaded (never used by regular customers)
const KioskLayout      = lazyWithReload(() => import("./kiosk/KioskLayout"), "KioskLayout");
const KioskWelcome     = lazyWithReload(() => import("./kiosk/KioskWelcome"), "KioskWelcome");
const KioskMenuPage    = lazyWithReload(() => import("./kiosk/KioskMenuPage"), "KioskMenuPage");
const KioskOrderPage   = lazyWithReload(() => import("./kiosk/KioskOrderPage"), "KioskOrderPage");
const KioskSummaryPage = lazyWithReload(() => import("./kiosk/KioskSummaryPage"), "KioskSummaryPage");
const KioskDonePage    = lazyWithReload(() => import("./kiosk/KioskDonePage"), "KioskDonePage");
const UnifiedStaffApp  = lazyWithReload(() => import("./staff/UnifiedStaffApp"), "UnifiedStaffApp");

// Providers
import { OrderProvider } from "./order/OrderContext";
import { AuthContext } from "./context/AuthContext";
import { StaffAuthProvider } from "./context/StaffAuthContext";
import { AvailabilityProvider } from "./context/AvailabilityContext";

// Layouts
import CustomerLayout from "./layouts/CustomerLayout";

function PageLoader() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb", borderTopColor: "#4A7A5A", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const PrivateRoute = ({ children }) => {
  const { isLoggedIn } = React.useContext(AuthContext);
  const location = useLocation();

  return isLoggedIn ? (
    children
  ) : (
    <Navigate
      to="/login"
      replace
      state={{ from: location.pathname + location.search }}
    />
  );
};

const App = () => {
  return (
    <Router>
      <StaffAuthProvider>
        <AvailabilityProvider>
        <OrderProvider>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* ✅ Customer App */}
            <Route element={<CustomerLayout />}>
              <Route path="/" element={<Home />} />

              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              <Route path="/rewards-deals" element={<RewardsDeals />} />
              <Route path="/earn-points" element={<EarnPoints />} />
              <Route path="/more-options" element={<MoreOptions />} />
              <Route path="/ubicaciones" element={<LocationPage />} />
              <Route path="/qr" element={<QrCodePage />} />
              <Route path="/aviso-de-privacidad" element={<PrivacyPolicy />} />
              <Route path="/terminos-de-servicio" element={<TermsOfService />} />
              <Route path="/pair/:token" element={<KioskPair />} />

              <Route path="/menu" element={<MenuPage />} />
              <Route path="/order" element={<OrderPage />} />
              <Route path="/summary" element={<OrderSummaryPage />} />
              <Route path="/seguimiento/:orderId" element={<OrderTracking />} />

              <Route
                path="/mi-cuenta"
                element={
                  <PrivateRoute>
                    <MiCuenta />
                  </PrivateRoute>
                }
              />
              <Route
                path="/claim-reward"
                element={
                  <PrivateRoute>
                    <ClaimRewardPage />
                  </PrivateRoute>
                }
              />
            </Route>

            {/* ✅ Self-service kiosk (counter tablet) */}
            <Route element={<KioskLayout />}>
              <Route path="/kiosk" element={<KioskWelcome />} />
              <Route path="/kiosk/menu" element={<KioskMenuPage />} />
              <Route path="/kiosk/order" element={<KioskOrderPage />} />
              <Route path="/kiosk/summary" element={<KioskSummaryPage />} />
              <Route path="/kiosk/done" element={<KioskDonePage />} />
            </Route>

            {/* ✅ Unified staff app — PIN login + role-based tabs */}
            <Route path="/staff" element={<UnifiedStaffApp />} />

            {/* Legacy routes → redirect to unified staff app */}
            <Route path="/empleados" element={<Navigate to="/staff" replace />} />
            <Route path="/staff/login" element={<Navigate to="/staff" replace />} />
            <Route path="/pos" element={<Navigate to="/staff" replace />} />
            <Route path="/kitchen" element={<Navigate to="/staff" replace />} />
            <Route path="/pos-legacy" element={<Navigate to="/staff" replace />} />

            {/* fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </OrderProvider>
        </AvailabilityProvider>
      </StaffAuthProvider>
    </Router>
  );
};

export default App;

