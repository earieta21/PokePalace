import { useEffect, useRef, useState } from "react";

const DISMISSED_KEY = "pwaDismissed";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function isInStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

export default function PwaInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [showIos, setShowIos]         = useState(false);
  const [visible, setVisible]         = useState(false);
  const [installing, setInstalling]   = useState(false);
  const [iosStep2, setIosStep2]       = useState(false);
  const dismissed                     = useRef(localStorage.getItem(DISMISSED_KEY) === "1");

  useEffect(() => {
    if (dismissed.current || isInStandalone()) return;

    const handler = (e) => {
      e.preventDefault();
      setPromptEvent(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (isIos()) {
      const timer = setTimeout(() => {
        setShowIos(true);
        setVisible(true);
      }, 4000);
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        clearTimeout(timer);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    setVisible(false);
    dismissed.current = true;
    localStorage.setItem(DISMISSED_KEY, "1");
  };

  const install = async () => {
    if (!promptEvent) return;
    setInstalling(true);
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    setInstalling(false);
    if (outcome === "accepted") setVisible(false);
  };

  // Opens the native iOS share sheet — user selects "Agregar a inicio" inside it
  const openIosShare = async () => {
    try {
      await navigator.share({
        title: "Poke Palace",
        text: "Pide tu bowl de poke",
        url: window.location.origin,
      });
    } catch {
      // User cancelled or share not supported — show manual fallback
    }
    setIosStep2(true);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 80,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 8500,
      width: "min(360px, calc(100vw - 32px))",
      background: "#fff",
      borderRadius: 18,
      boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
      border: "1.5px solid #e5e7eb",
      padding: "16px 18px",
      display: "flex",
      gap: 12,
      alignItems: "flex-start",
      animation: "promptIn 0.35s cubic-bezier(0.34,1.56,0.64,1)",
    }}>
      <img
        src="/icon.svg"
        alt="Poke Palace"
        style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#111" }}>
          Instala Poke Palace
        </p>

        {showIos ? (
          iosStep2 ? (
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "#555", lineHeight: 1.6 }}>
              En el menú que se abrió, busca{" "}
              <strong style={{ color: "#111" }}>"Agregar a inicio"</strong>{" "}
              (puede que tengas que deslizar hacia abajo dentro del menú).
            </p>
          ) : (
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "#555", lineHeight: 1.6 }}>
              Toca el botón de abajo para abrir el menú de compartir de Safari,
              luego elige <strong style={{ color: "#111" }}>"Agregar a inicio"</strong>.
            </p>
          )
        ) : (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#555", lineHeight: 1.6 }}>
            Accede rápido desde tu pantalla de inicio, sin abrir el navegador.
          </p>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {showIos && !iosStep2 && (
            <button
              onClick={openIosShare}
              style={{
                background: "#0a7aff", color: "#fff", border: "none",
                borderRadius: 8, padding: "7px 14px", fontSize: 13,
                fontWeight: 700, cursor: "pointer", flexShrink: 0,
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              <span style={{ fontSize: 16 }}>⬆</span> Compartir
            </button>
          )}

          {!showIos && (
            <button
              onClick={install}
              disabled={installing}
              style={{
                background: "#4A7A5A", color: "#fff", border: "none",
                borderRadius: 8, padding: "7px 16px", fontSize: 13,
                fontWeight: 700, cursor: "pointer", flexShrink: 0,
              }}
            >
              {installing ? "Instalando…" : "Instalar"}
            </button>
          )}

          <button
            onClick={dismiss}
            style={{
              background: "transparent", color: "#888", border: "1px solid #e5e7eb",
              borderRadius: 8, padding: "7px 14px", fontSize: 13,
              cursor: "pointer", flexShrink: 0,
            }}
          >
            {iosStep2 ? "Listo" : "Ahora no"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes promptIn {
          from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1); }
        }
      `}</style>
    </div>
  );
}
