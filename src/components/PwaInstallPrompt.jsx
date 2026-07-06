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
  const dismissed                     = useRef(localStorage.getItem(DISMISSED_KEY) === "1");

  useEffect(() => {
    if (dismissed.current || isInStandalone()) return;

    // Android / Chrome: capture native install prompt
    const handler = (e) => {
      e.preventDefault();
      setPromptEvent(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari: show manual instructions after 4 s (don't annoy immediately)
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
    if (outcome === "accepted") {
      setVisible(false);
    }
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
      {/* Icon */}
      <img
        src="/icon.svg"
        alt="Poke Palace"
        style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: "#111" }}>
          Instala Poke Palace
        </p>

        {showIos ? (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#555", lineHeight: 1.5 }}>
            Toca el botón{" "}
            <strong style={{ color: "#0a7aff" }}>Compartir</strong>{" "}
            <span style={{ fontSize: 14 }}>⎋</span> y luego{" "}
            <strong>"Agregar a inicio"</strong> para instalarla en tu iPhone.
          </p>
        ) : (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#555", lineHeight: 1.5 }}>
            Accede rápido desde tu pantalla de inicio, sin abrir el navegador.
          </p>
        )}

        <div style={{ display: "flex", gap: 8 }}>
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
            Ahora no
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
