import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import OrderPage from "./order/OrderPage";
import RewardsDeals from "./pages/Promotions";
import EarnPoints from "./pages/EarnPoints";
import MoreOptions from "./more/MoreOptions";
import MiCuenta from "./pages/MiCuenta";

import Login from "./pages/Login";
import Register from "./pages/Register";

import { OrderProvider } from "./order/OrderContext";
import { AuthContext } from "./context/AuthContext";

// ✅ Componente para proteger rutas
const PrivateRoute = ({ children }) => {
  const { isLoggedIn } = React.useContext(AuthContext);
  return isLoggedIn ? children : <Navigate to="/login" replace />;
};

const App = () => {
  return (
    <Router>
      <OrderProvider>
        <Navbar />

        <Routes>
          <Route path="/" element={<Home />} />

          {/* ✅ Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* ✅ Rutas públicas */}
          <Route path="/rewards-deals" element={<RewardsDeals />} />
          <Route path="/earn-points" element={<EarnPoints />} />
          <Route path="/more-options" element={<MoreOptions />} />

          {/* 🔒 Ruta protegida */}
          <Route
            path="/order"
            element={
              <PrivateRoute>
                <OrderPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/mi-cuenta"
            element={
              <PrivateRoute>
                <MiCuenta />
              </PrivateRoute>
            }
          />

          {/* 404 simple */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </OrderProvider>
    </Router>
  );
};

export default App;
