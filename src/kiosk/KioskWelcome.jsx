import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Leaf } from "lucide-react";
import { useOrder } from "../order/OrderContext";
import { useAvailability } from "../context/AvailabilityContext";
import useIdleTimeout from "./useIdleTimeout";
import KioskTodayPromo from "./KioskTodayPromo";
import { activeKioskPromos, promoScheduleText } from "./todayPromo";
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
  const { resetOrder, startPromo2x1 } = useOrder();
  const availability = useAvailability();
  const [screensaverOn, setScreensaverOn] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const landscape = useLandscape();
  const slides = landscape ? LANDSCAPE_SLIDES : PORTRAIT_SLIDES;
  const activeSlide = slideIndex % slides.length;
  // Se evalúa en cada vuelta a esta pantalla (cada cliente), así el kiosco
  // suelta el tema el 1 de noviembre aunque nadie recargue la página.
  const halloween = useHalloweenTheme();
  const todayPromos = activeKioskPromos(availability);
  const schedule = promoScheduleText(availability.promoWeekdays);

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

  const startOrder = () => navigate("/kiosk/menu");
  // Las promos del día tienen su atajo: el 2x1 abre el armador ya en modo
  // promo y el combo abre el menú con su armador abierto.
  const start2x1 = () => {
    startPromo2x1();
    navigate("/kiosk/order");
  };
  const openCombo = () => navigate("/kiosk/menu", { state: { openCombo: true } });

  return (
    <main className={styles.page}>
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
            {todayPromos.map((promo) => (
              <p key={promo.id} className={styles.screensaverPromo}>
                Hoy: {promo.title} · {promo.deal}
              </p>
            ))}
            <p className={styles.screensaverHint}>Toca la pantalla para ordenar</p>
          </div>
        </div>
      )}

      <div className={styles.photo}>
        <img src={chopsticksWidePhoto} alt="" />
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
        <span className={styles.brand}>
          <Leaf size={30} strokeWidth={1.5} aria-hidden="true" /> Poke Palace
        </span>
      </div>

      <div className={styles.content}>
        <div>
          <h1 className={styles.title}>
            {halloween ? <>Arma tu bowl <span>de miedo</span></> : "Arma tu bowl"}
          </h1>
          <p className={styles.subtitle}>
            Elige base, proteína y toppings a tu gusto. Pagas en caja al terminar.
          </p>
        </div>

        <button type="button" className={styles.start} onClick={startOrder}>
          Toca para ordenar <ArrowRight size={28} aria-hidden="true" />
        </button>

        <div className={styles.promos}>
          <KioskTodayPromo size="large" onStart2x1={start2x1} onOpenCombo={openCombo} />
        </div>

        {schedule && (
          <p className={styles.schedule}>
            <strong>Promos de la semana</strong>
            {schedule}
          </p>
        )}
      </div>
    </main>
  );
}
