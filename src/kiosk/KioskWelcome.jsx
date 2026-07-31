import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrder } from "../order/OrderContext";
import useIdleTimeout from "./useIdleTimeout";
import styles from "./KioskWelcome.module.css";

import emeraldSalmon from "../assets/menu/emeraldSalmon.webp";
import spicyTuna from "../assets/menu/spicyTuna.webp";
import tropicalShrimp from "../assets/menu/tropicalShrimp.webp";
import citrusOctopus from "../assets/menu/citrusOctopus.webp";
import pokeBowl from "../assets/poke.webp";

const SCREENSAVER_IDLE_MS = 25000;
const SLIDE_INTERVAL_MS = 5000;
const SLIDES = [emeraldSalmon, spicyTuna, tropicalShrimp, citrusOctopus, pokeBowl];

export default function KioskWelcome() {
  const navigate = useNavigate();
  const { resetOrder } = useOrder();
  const [screensaverOn, setScreensaverOn] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  // Defensive: wipe any leftover selections from the previous customer
  // every time this idle screen is shown.
  useEffect(() => {
    resetOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nobody's walked up to order in a while — switch to a full-screen photo
  // slideshow so the kiosk grabs attention instead of sitting on a static
  // "tap to start" screen.
  useIdleTimeout(() => setScreensaverOn(true), SCREENSAVER_IDLE_MS);

  useEffect(() => {
    if (!screensaverOn) return;
    const interval = setInterval(() => {
      setSlideIndex((i) => (i + 1) % SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [screensaverOn]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: 24,
        textAlign: "center",
        background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 60%)",
      }}
    >
      {screensaverOn && (
        <div
          className={styles.screensaver}
          role="button"
          tabIndex={0}
          aria-label="Toca la pantalla para ordenar"
          onClick={() => setScreensaverOn(false)}
        >
          {SLIDES.map((src, i) => (
            <div
              key={src}
              className={`${styles.slide} ${i === slideIndex ? styles.slideActive : ""}`}
              style={{ backgroundImage: `url(${src})` }}
            />
          ))}
          <div className={styles.screensaverOverlay}>
            <p className={styles.screensaverBrand}>Poke Palace</p>
            <p className={styles.screensaverHint}>Toca la pantalla para ordenar</p>
          </div>
        </div>
      )}

      <div>
        <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "#c2410c" }}>
          Poke Palace
        </p>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, color: "#1a1a1a" }}>
          Arma tu bowl
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 16, color: "#555" }}>
          Elige base, proteínas y toppings a tu gusto.
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate("/kiosk/menu")}
        style={{
          padding: "22px 56px",
          borderRadius: 999,
          border: "none",
          background: "#1a1a1a",
          color: "#fff",
          fontWeight: 800,
          fontSize: 20,
          cursor: "pointer",
          boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
        }}
      >
        Toca para comenzar
      </button>

      <p style={{ margin: 0, fontSize: 13, color: "#888" }}>
        Pagas en caja al terminar tu pedido
      </p>
    </div>
  );
}
