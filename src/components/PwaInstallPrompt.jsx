import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";

const DISMISSED_KEY = "pwaDismissed";
const VISIT_COUNT_KEY = "pwaVisitCount";
const SESSION_VISIT_KEY = "pwaVisitRegistered";
const PROMPT_DELAY_MS = 10000;

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function isInStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function registerVisit() {
  try {
    let visitCount = Number(localStorage.getItem(VISIT_COUNT_KEY)) || 0;
    if (!sessionStorage.getItem(SESSION_VISIT_KEY)) {
      visitCount += 1;
      localStorage.setItem(VISIT_COUNT_KEY, String(visitCount));
      sessionStorage.setItem(SESSION_VISIT_KEY, "1");
    }
    return visitCount >= 2;
  } catch {
    // If storage is unavailable, avoid interrupting a first-time visitor.
    return false;
  }
}

export default function PwaInstallPrompt() {
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const [promptEvent, setPromptEvent] = useState(null);
  const [showIos] = useState(() => isIos());
  const [isReturnVisit, setIsReturnVisit] = useState(false);
  const [delayReady, setDelayReady] = useState(false);
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [installing, setInstalling] = useState(false);
  const [iosStep2, setIosStep2] = useState(false);
  const isHome = pathname === "/";

  useEffect(() => {
    setIsReturnVisit(registerVisit());
  }, []);

  useEffect(() => {
    if (dismissed || isInStandalone()) return undefined;

    const handler = (event) => {
      event.preventDefault();
      setPromptEvent(event);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [dismissed]);

  useEffect(() => {
    setDelayReady(false);
    setIosStep2(false);
    if (!isHome || !isReturnVisit || dismissed || isInStandalone()) return undefined;

    const timer = window.setTimeout(() => setDelayReady(true), PROMPT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [dismissed, isHome, isReturnVisit]);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // State still prevents the prompt from returning in this session.
    }
  };

  const install = async () => {
    if (!promptEvent) return;
    setInstalling(true);
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    setInstalling(false);
    setPromptEvent(null);
    if (outcome === "accepted") dismiss();
  };

  const openIosShare = async () => {
    try {
      await navigator.share({
        title: "Poke Palace",
        text: t("pwa.shareText"),
        url: window.location.origin,
      });
    } catch {
      // If sharing is cancelled or unavailable, keep the manual instructions visible.
    }
    setIosStep2(true);
  };

  const visible = isHome
    && isReturnVisit
    && delayReady
    && !dismissed
    && (showIos || Boolean(promptEvent));

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="pwa-install-title"
      aria-describedby="pwa-install-description"
      style={{
        position: "fixed",
        bottom: "calc(136px + env(safe-area-inset-bottom, 0px))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 950,
        width: "min(360px, calc(100vw - 32px))",
        maxHeight: "calc(100dvh - 160px)",
        overflowY: "auto",
        background: "var(--bg-card)",
        borderRadius: 18,
        boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        border: "1.5px solid var(--border-md)",
        padding: "16px 18px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        animation: "promptIn 0.35s cubic-bezier(0.34,1.56,0.64,1)",
      }}
    >
      <img
        src="/icons/icon-192.png"
        alt=""
        aria-hidden="true"
        style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p id="pwa-install-title" style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
          {t("pwa.title")}
        </p>

        <p id="pwa-install-description" style={{ margin: "0 0 10px", fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
          {showIos
            ? t(iosStep2 ? "pwa.iosStep2" : "pwa.iosInstructions")
            : t("pwa.description")}
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {showIos && !iosStep2 && (
            <button
              type="button"
              onClick={openIosShare}
              style={{
                background: "#0a7aff", color: "#fff", border: "none",
                borderRadius: 8, padding: "7px 14px", fontSize: 13,
                fontWeight: 700, cursor: "pointer", flexShrink: 0,
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 16 }}>⬆</span> {t("pwa.share")}
            </button>
          )}

          {!showIos && (
            <button
              type="button"
              onClick={install}
              disabled={installing}
              style={{
                background: "#4A7A5A", color: "#fff", border: "none",
                borderRadius: 8, padding: "7px 16px", fontSize: 13,
                fontWeight: 700, cursor: "pointer", flexShrink: 0,
              }}
            >
              {installing ? t("pwa.installing") : t("pwa.install")}
            </button>
          )}

          <button
            type="button"
            onClick={dismiss}
            style={{
              background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-md)",
              borderRadius: 8, padding: "7px 14px", fontSize: 13,
              cursor: "pointer", flexShrink: 0,
            }}
          >
            {iosStep2 ? t("pwa.done") : t("pwa.notNow")}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes promptIn {
          from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
