import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useOrder } from "../order/OrderContext";
import MenuBrowser from "../order/MenuBrowser";
import KioskHeader from "./KioskHeader";
import useIdleTimeout from "./useIdleTimeout";
import styles from "./KioskMenuPage.module.css";

const IDLE_TIMEOUT_MS = 60000;

export default function KioskMenuPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { resetOrder } = useOrder();
  const goToWelcome = useCallback(() => {
    resetOrder();
    navigate("/kiosk", { replace: true });
  }, [resetOrder, navigate]);
  useIdleTimeout(goToWelcome, IDLE_TIMEOUT_MS);

  // "Elegir mi combo" desde la bienvenida llega aquí con el armador del
  // combo ya abierto. La promo del día (2x1 o Combo Palace) la pinta
  // MenuBrowser arriba del menú, con su propio botón.
  const openCombo = Boolean(location.state?.openCombo);

  return (
    <main className={styles.page}>
      <KioskHeader onCancel={goToWelcome} />
      <MenuBrowser
        isKiosk
        initialComboId={openCombo ? "combo-palace" : ""}
        onBuildBowl={() => navigate("/kiosk/order")}
        onGoToCart={() => navigate("/kiosk/summary")}
      />
    </main>
  );
}
