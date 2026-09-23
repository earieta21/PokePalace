import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Leaf, X } from "lucide-react";
import { useOrder } from "../order/OrderContext";
import { useAvailability } from "../context/AvailabilityContext";
import { PROMO_2X1_BOWLS_PRICE } from "../order/pricing";
import MenuBrowser from "../order/MenuBrowser";
import useIdleTimeout from "./useIdleTimeout";
import styles from "./KioskMenuPage.module.css";

const IDLE_TIMEOUT_MS = 60000;

export default function KioskMenuPage() {
  const navigate = useNavigate();
  const { resetOrder, startPromo2x1 } = useOrder();
  const { promo2x1Active } = useAvailability();
  const goToWelcome = useCallback(() => {
    resetOrder();
    navigate("/kiosk", { replace: true });
  }, [resetOrder, navigate]);
  useIdleTimeout(goToWelcome, IDLE_TIMEOUT_MS);

  const handleStartPromo2x1 = () => {
    startPromo2x1();
    navigate("/kiosk/order");
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Leaf size={28} strokeWidth={1.5} aria-hidden="true" />
          <span>
            Poke Palace<small>FRESCO. A TU GUSTO.</small>
          </span>
        </div>
        <button type="button" onClick={goToWelcome} className={styles.cancel}>
          <X size={17} aria-hidden="true" /> Cancelar pedido
        </button>
      </header>
      <ol className={styles.steps} aria-label="Pasos de tu pedido">
        <li aria-current="step">
          <span>01</span> Elige tu antojo
        </li>
        <li>
          <span>02</span> Revisa tu pedido
        </li>
        <li>
          <span>03</span> Paga en caja
        </li>
      </ol>
      {promo2x1Active && (
        <aside className={styles.promo} aria-label="Promoción de bowls">
          <div>
            <strong>
              Hoy se comparte: 2 bowls por ${PROMO_2X1_BOWLS_PRICE} MXN
            </strong>
            <p>Promo 2x1 · Solo para comer en el restaurante.</p>
          </div>
          <button type="button" onClick={handleStartPromo2x1}>
            Armar mis 2 bowls <ArrowRight size={18} aria-hidden="true" />
          </button>
        </aside>
      )}
      <MenuBrowser
        isKiosk
        onBuildBowl={() => navigate("/kiosk/order")}
        onGoToCart={() => navigate("/kiosk/summary")}
      />
    </main>
  );
}
