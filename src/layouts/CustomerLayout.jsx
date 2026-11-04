import { useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { Outlet, useLocation } from "react-router-dom";
import ErrorBoundary from "../components/ErrorBoundary";
import ActiveOrderBanner from "../components/ActiveOrderBanner";
import CartBar from "../components/CartBar";
import PwaInstallPrompt from "../components/PwaInstallPrompt";
import { useLanguage } from "../i18n/LanguageContext";
import { pageMetaFor } from "../data/pageMeta";
import { trackPageView } from "../utils/analytics";

const SITE_URL = "https://pokepalace.org";

// Cada página se declara como su propia URL (sin ?parámetros) y con su
// título y descripción, para que Google indexe /menu, /ubicaciones, etc. por
// separado. Ver public/sitemap.xml y src/data/pageMeta.js.
function usePageMeta() {
  const { pathname } = useLocation();
  const { language } = useLanguage();
  useEffect(() => {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = `${SITE_URL}${pathname}`;

    const { title, description } = pageMetaFor(pathname, language);
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", `${SITE_URL}${pathname}`);
    document.querySelector('meta[property="og:locale"]')?.setAttribute("content", language === "en" ? "en_US" : "es_MX");
    document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", description);
    trackPageView(pathname, title);
  }, [pathname, language]);
}

export default function CustomerLayout() {
  usePageMeta();

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
