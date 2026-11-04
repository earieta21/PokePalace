import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrder } from "../order/OrderContext";
import useIdleTimeout from "./useIdleTimeout";
import { useHalloweenTheme } from "../data/seasonalTheme";
import { Bat, Pumpkin } from "../components/HalloweenDecor";
import styles from "./KioskWelcome.module.css";

import chopsticksPhoto from "../assets/home/hero-chopsticks-mobile-900.webp";
import inspirationOnePhoto from "../assets/home/inspiration-one-1200.webp";
import inspirationTwoPhoto from "../assets/home/inspiration-two-1200.webp";
import inspirationThreePhoto from "../assets/home/inspiration-three-1200.webp";
import visitPhoto from "../assets/home/visit-poke-palace-900.webp";
import chopsticksWidePhoto from "../assets/home/hero-chopsticks-1200.webp";
import buildYourBowlPhoto from "../assets/home/build-your-bowl-1200.webp";

const SCREENSAVER_IDLE_MS = 25000;
const SLIDE_INTERVAL_MS = 5000;
// Las mismas fotos del local que la página de inicio. El kiosco va en
// vertical (manifest-kiosk.json) y estas son 2:3, casi la forma de la iPad:
// a pantalla completa apenas se recortan. Si la iPad se pone en horizontal
// se usan las dos horizontales, para no enseñar solo una franja del bowl.
const PORTRAIT_SLIDES = [chopsticksPhoto, inspirationOnePhoto, inspirationTwoPhoto, inspirationThreePhoto, visitPhoto];
const LANDSCAPE_SLIDES = [chopsticksWidePhoto, buildYourBowlPhoto];
const LANDSCAPE_QUERY = "(orientation: landscape)";

function useLandscape() {
  const [landscape, setLandscape] = useState(
    () => typeof window !== "undefined" && Boolean(window.matchMedia?.(LANDSCAPE_QUERY).matches)
  );
  useEffect(() => {
    const query = window.matchMedia?.(LANDSCAPE_QUERY);
    if (!query) return undefined;
    const update = () => setLandscape(query.matches);
    update();
    // Safari de iPads viejas solo tiene addListener.
    if (query.addEventListener) query.addEventListener("change", update);
    else query.addListener(update);
    return () => {
      if (query.removeEventListener) query.removeEventListener("change", update);
      else query.removeListener(update);
    };
  }, []);
  return landscape;
}

export default function KioskWelcome() {
  const navigate = useNavigate();
  const { resetOrder } = useOrder();
  const [screensaverOn, setScreensaverOn] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const slides = useLandscape() ? LANDSCAPE_SLIDES : PORTRAIT_SLIDES;
  const activeSlide = slideIndex % slides.length;
  // Se evalúa en cada vuelta a esta pantalla (cada cliente), así el kiosco
  // suelta el tema el 1 de noviembre aunque nadie recargue la página.
  const halloween = useHalloweenTheme();

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
      setSlideIndex((i) => (i + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [screensaverOn, slides.length]);

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
        position: "relative",
        overflow: "hidden",
        background: halloween
          ? "radial-gradient(circle at 80% 12%, rgba(255, 138, 43, 0.18), transparent 38%), #1d1426"
          : "linear-gradient(135deg, #fff7ed 0%, #ffffff 60%)",
      }}
    >
      {halloween && (
        <div className={styles.spooky} aria-hidden="true">
          <span className={styles.moon} />
          <Bat className={`${styles.bat} ${styles.batOne}`} />
          <Bat className={`${styles.bat} ${styles.batTwo}`} />
          <Bat className={`${styles.bat} ${styles.batThree}`} />
          <Pumpkin className={`${styles.pumpkin} ${styles.pumpkinLeft}`} />
          <Pumpkin className={`${styles.pumpkin} ${styles.pumpkinRight}`} />
        </div>
      )}
      {screensaverOn && (
        <div
          className={styles.screensaver}
          role="button"
          tabIndex={0}
          aria-label="Toca la pantalla para ordenar"
          onClick={() => setScreensaverOn(false)}
        >
          {slides.map((src, i) => (
            <div
              key={src}
              className={`${styles.slide} ${i === activeSlide ? styles.slideActive : ""}`}
              style={{ backgroundImage: `url(${src})` }}
            />
          ))}
          <div className={`${styles.screensaverOverlay} ${halloween ? styles.screensaverHalloween : ""}`}>
            {halloween && <Pumpkin className={styles.screensaverPumpkin} />}
            <p className={styles.screensaverBrand}>Poke Palace</p>
            {halloween && <p className={styles.screensaverSeason}>Temporada de Halloween</p>}
            <p className={styles.screensaverHint}>Toca la pantalla para ordenar</p>
          </div>
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1 }}>
        <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: halloween ? "#ff8a2b" : "#c2410c" }}>
          {halloween ? "Poke Palace · Halloween" : "Poke Palace"}
        </p>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, color: halloween ? "#f6ead7" : "#1a1a1a" }}>
          {halloween ? <>Arma tu bowl <span style={{ color: "#ff8a2b" }}>de miedo</span></> : "Arma tu bowl"}
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 16, color: halloween ? "#cdbfd8" : "#555" }}>
          Elige base, proteínas y toppings a tu gusto.
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate("/kiosk/menu")}
        style={{
          position: "relative",
          zIndex: 1,
          padding: "22px 56px",
          borderRadius: 999,
          border: "none",
          background: halloween ? "#ff7a1a" : "#1a1a1a",
          color: halloween ? "#1d1426" : "#fff",
          fontWeight: 800,
          fontSize: 20,
          cursor: "pointer",
          boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
        }}
      >
        Toca para comenzar
      </button>

      <p style={{ position: "relative", zIndex: 1, margin: 0, fontSize: 13, color: halloween ? "#a997b8" : "#888" }}>
        Pagas en caja al terminar tu pedido
      </p>
    </div>
  );
}
