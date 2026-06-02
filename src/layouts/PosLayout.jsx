import { Outlet } from "react-router-dom";

// The employee portal provides its own full-screen layout (sidebar + topbar).
// This wrapper just renders the outlet so the portal takes over the entire viewport.
export default function PosLayout() {
  return <Outlet />;
}
