import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import ErrorBoundary from "../components/ErrorBoundary";
import { useHalloweenTheme } from "../data/seasonalTheme";

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

// Noche de Halloween: tokens del tema oscuro con tinte morado. Los módulos
// del kiosco que usan colores fijos se ajustan con :global(.kioskHalloween).
const HALLOWEEN_TOKENS = {
  "--bg": "#17111e",
  "--bg-card": "#221a2c",
  "--bg-muted": "#2c2238",
  "--bg-subtle": "#1d1626",
  "--text": "#f6ead7",
  "--text-2": "#cdbfd8",
  "--text-3": "#9d8fae",
  "--accent": "#ff8a2b",
  "--accent-2": "#ffa45c",
  "--accent-bg": "rgba(255, 138, 43, 0.14)",
  "--accent-border": "rgba(255, 138, 43, 0.4)",
  "--border": "rgba(255, 255, 255, 0.08)",
  "--border-md": "rgba(255, 255, 255, 0.14)",
  minHeight: "100dvh",
  background: "#17111e",
  color: "#f6ead7",
  colorScheme: "dark",
};

// Full-screen, no customer Navbar — a walk-in using the counter tablet
// should never be able to wander into login/account/promotions pages.
export default function KioskLayout() {
  useKioskManifest();
  const halloween = useHalloweenTheme();

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
      <div
        data-theme={halloween ? "dark" : "light"}
        className={halloween ? "kioskHalloween" : undefined}
        style={halloween ? HALLOWEEN_TOKENS : { minHeight: "100dvh", background: "#fff", colorScheme: "light" }}
      >
        <Outlet />
      </div>
    </ErrorBoundary>
  );
}
