import { Outlet } from "react-router-dom";
import ErrorBoundary from "../components/ErrorBoundary";

// The employee portal provides its own full-screen layout (sidebar + topbar).
// This wrapper just renders the outlet so the portal takes over the entire viewport.
export default function PosLayout() {
  return (
    <ErrorBoundary
      label="pos"
      message="La caja tuvo un error inesperado. Recarga la pantalla — los pedidos ya guardados están a salvo en el servidor."
    >
      <Outlet />
    </ErrorBoundary>
  );
}
