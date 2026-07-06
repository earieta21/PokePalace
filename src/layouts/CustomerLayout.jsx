import Navbar from "../components/Navbar";
import { Outlet } from "react-router-dom";
import ErrorBoundary from "../components/ErrorBoundary";
import ActiveOrderBanner from "../components/ActiveOrderBanner";

export default function CustomerLayout() {
  return (
    <>
      <Navbar />
      <ErrorBoundary
        label="customer"
        message="Tuvimos un problema cargando esta página. Intenta recargar — tu carrito y sesión no se pierden."
      >
        <Outlet />
      </ErrorBoundary>
      <ActiveOrderBanner />
    </>
  );
}
