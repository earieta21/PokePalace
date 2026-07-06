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

// Customer pages — lazy loaded
const OrderPage        = lazy(() => import("./order/OrderPage"));
const RewardsDeals     = lazy(() => import("./pages/Promotions"));
const EarnPoints       = lazy(() => import("./pages/EarnPoints"));
const MoreOptions      = lazy(() => import("./more/MoreOptions"));
const MiCuenta         = lazy(() => import("./pages/MiCuenta"));
const OrderSummaryPage = lazy(() => import("./pages/OrderSummaryPage"));
const OrderTracking    = lazy(() => import("./pages/OrderTracking"));
const LocationPage     = lazy(() => import("./pages/LocationPage"));

// Kiosk & staff — lazy loaded (never used by regular customers)
const KioskLayout      = lazy(() => import("./kiosk/KioskLayout"));
const KioskWelcome     = lazy(() => import("./kiosk/KioskWelcome"));
const KioskOrderPage   = lazy(() => import("./kiosk/KioskOrderPage"));
const KioskSummaryPage = lazy(() => import("./kiosk/KioskSummaryPage"));
const KioskDonePage    = lazy(() => import("./kiosk/KioskDonePage"));
const UnifiedStaffApp  = lazy(() => import("./staff/UnifiedStaffApp"));

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
            </Route>

            {/* ✅ Self-service kiosk (counter tablet) */}
            <Route element={<KioskLayout />}>
              <Route path="/kiosk" element={<KioskWelcome />} />
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
