import { useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { Outlet, useLocation } from "react-router-dom";
import ErrorBoundary from "../components/ErrorBoundary";
import ActiveOrderBanner from "../components/ActiveOrderBanner";
import CartBar from "../components/CartBar";
import PwaInstallPrompt from "../components/PwaInstallPrompt";

const SITE_URL = "https://pokepalace.org";

// Cada página se declara como su propia URL (sin ?parámetros) para que Google
// indexe /menu, /ubicaciones, etc. por separado. Ver public/sitemap.xml.
function useCanonicalUrl() {
  const { pathname } = useLocation();
  useEffect(() => {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = `${SITE_URL}${pathname}`;
  }, [pathname]);
}

export default function CustomerLayout() {
  useCanonicalUrl();

  return (
    <>
      <Navbar />
      <ErrorBoundary
        label="customer"
        message="Tuvimos un problema cargando esta página. Intenta recargar — tu carrito y sesión no se pierden."
      >
        <Outlet />
      </ErrorBoundary>
      <Footer />
      <CartBar />
      <ActiveOrderBanner />
      <PwaInstallPrompt />
    </>
  );
}
