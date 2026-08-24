import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import ErrorBoundary from "../components/ErrorBoundary";

const DEFAULT_MANIFEST = "/manifest.json";
const KIOSK_MANIFEST = "/manifest-kiosk.json";

// El manifest normal tiene start_url "/" — si el iPad del kiosko se agrega
// a la pantalla de inicio desde aquí, iOS ignoraría la página actual y
// abriría siempre el inicio del sitio (sin barra de direcciones para
// corregirlo, por ser modo "standalone"). Mientras se está en /kiosk/*, se
// cambia al manifest del kiosko (start_url "/kiosk") para que el ícono que
// se agregue desde aquí sí abra el kiosko.
function useKioskManifest() {
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return undefined;
    const previousHref = link.getAttribute("href") || DEFAULT_MANIFEST;
    link.setAttribute("href", KIOSK_MANIFEST);
    return () => link.setAttribute("href", previousHref);
  }, []);
}

// Full-screen, no customer Navbar — a walk-in using the counter tablet
// should never be able to wander into login/account/promotions pages.
export default function KioskLayout() {
  useKioskManifest();

  return (
    <ErrorBoundary
      label="kiosk"
      fallback={(reload) => (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            textAlign: "center",
          }}
        >
          <h2 style={{ margin: 0 }}>Algo salió mal</h2>
          <p style={{ margin: 0, color: "#666" }}>
            Pide ayuda a un miembro del equipo, o toca el botón para reiniciar.
          </p>
          <button
            onClick={reload}
            style={{
              padding: "14px 28px",
              borderRadius: 10,
              border: "none",
              background: "#1a1a1a",
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Reiniciar
          </button>
        </div>
      )}
    >
      <div style={{ minHeight: "100vh", background: "#fff" }}>
        <Outlet />
      </div>
    </ErrorBoundary>
  );
}
