import { ArrowRight } from "lucide-react";
import { useAvailability } from "../context/AvailabilityContext";
import { activeKioskPromos } from "./todayPromo";
import shrimpBowlPhoto from "../assets/home/shrimp-600.webp";
import comboPhoto from "../assets/home/inspiration-two-600.webp";
import styles from "./KioskTodayPromo.module.css";

// La promo del día, con su botón directo: en la bienvenida y arriba del menú
// del kiosco. Si hoy no corre ninguna, no pinta nada.
export default function KioskTodayPromo({
  onStart2x1,
  onOpenCombo,
  comboCount = 0,
  comboSoldOut = false,
  size = "regular",
}) {
  const availability = useAvailability();
  const promos = activeKioskPromos(availability);
  if (promos.length === 0) return null;

  return promos.map((promo) => {
    const is2x1 = promo.id === "promo2x1";
    const soldOut = !is2x1 && comboSoldOut;
    return (
      <section
        key={promo.id}
        className={`${styles.card} ${size === "large" ? styles.large : ""}`}
        aria-label={`Promo de hoy: ${promo.title}`}
      >
        <div className={styles.copy}>
          <span className={styles.eyebrow}>
            <span className={styles.dot} aria-hidden="true" /> Promo de hoy
          </span>
          <h2 className={styles.title}>{promo.title}</h2>
          <p className={styles.deal}>
            {promo.deal} <small>MXN</small>
          </p>
          <p className={styles.terms}>{promo.terms}</p>
          {soldOut ? (
            <p className={styles.soldOut}>Agotado por ahora</p>
          ) : (
            <button
              type="button"
              className={styles.cta}
              onClick={is2x1 ? onStart2x1 : onOpenCombo}
            >
              {promo.cta} <ArrowRight size={20} aria-hidden="true" />
            </button>
          )}
          {!is2x1 && comboCount > 0 && (
            <span className={styles.inCart}>
              {comboCount} en tu pedido
            </span>
          )}
        </div>
        {is2x1 ? (
          <div className={styles.pair} aria-hidden="true">
            <img src={shrimpBowlPhoto} alt="" />
            <img src={shrimpBowlPhoto} alt="" />
            <span className={styles.badge}>2x1</span>
          </div>
        ) : (
          <div className={styles.single} aria-hidden="true">
            <img src={comboPhoto} alt="" />
          </div>
        )}
      </section>
    );
  });
}
