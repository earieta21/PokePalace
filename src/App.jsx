import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

// Customer pages
import Home from "./pages/Home";
import OrderPage from "./order/OrderPage";
import RewardsDeals from "./pages/Promotions";
import EarnPoints from "./pages/EarnPoints";
import MoreOptions from "./more/MoreOptions";
import MiCuenta from "./pages/MiCuenta";
import Login from "./pages/Login";
import Register from "./pages/Register";
import OrderSummaryPage from "./pages/OrderSummaryPage";
import OrderTracking from "./pages/OrderTracking";
import LocationPage from "./pages/LocationPage";

// Providers
import { OrderProvider } from "./order/OrderContext";
import { AuthContext } from "./context/AuthContext";
import { StaffAuthProvider } from "./context/StaffAuthContext";

// Layouts
import CustomerLayout from "./layouts/CustomerLayout";
import PosLayout from "./layouts/PosLayout";

// Staff portal
import EmployeePortal from "./pos/EmployeePortal";

// Staff auth UI + guard
import StaffLogin from "./pages/StaffLogin";
import RoleRoute from "./auth/RoleRoute";

// Self-service kiosk (counter tablet)
import KioskLayout from "./kiosk/KioskLayout";
import KioskWelcome from "./kiosk/KioskWelcome";
import KioskOrderPage from "./kiosk/KioskOrderPage";
import KioskSummaryPage from "./kiosk/KioskSummaryPage";
import KioskDonePage from "./kiosk/KioskDonePage";

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
        <OrderProvider>
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

            {/* ✅ Staff Login */}
            <Route path="/staff/login" element={<StaffLogin />} />

            {/* ✅ Staff Portal — all roles land on /pos */}
            <Route element={<PosLayout />}>
              <Route
                path="/pos"
                element={
                  <RoleRoute
                    allowedRoles={["cashier", "kitchen", "manager", "admin", "owner"]}
                  >
                    <EmployeePortal />
                  </RoleRoute>
                }
              />
              {/* Legacy kitchen route → redirect to unified portal */}
              <Route path="/kitchen" element={<Navigate to="/pos" replace />} />
            </Route>

            {/* fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </OrderProvider>
      </StaffAuthProvider>
    </Router>
  );
};

export default App;
