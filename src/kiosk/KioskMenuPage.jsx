import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useOrder } from "../order/OrderContext";
import MenuBrowser from "../order/MenuBrowser";
import useIdleTimeout from "./useIdleTimeout";

const IDLE_TIMEOUT_MS = 60000;

export default function KioskMenuPage() {
  const navigate = useNavigate();
  const { resetOrder } = useOrder();

  const goToWelcome = useCallback(() => {
    resetOrder();
    navigate("/kiosk", { replace: true });
  }, [resetOrder, navigate]);

  useIdleTimeout(goToWelcome, IDLE_TIMEOUT_MS);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={goToWelcome}
        style={{
          position: "fixed",
          top: 14,
          right: 14,
          zIndex: 50,
          padding: "9px 16px",
          borderRadius: 999,
          border: "1px solid #ddd",
          background: "#fff",
          color: "#555",
          fontWeight: 700,
          fontSize: 12.5,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        Cancelar pedido
      </button>
      <MenuBrowser
        onBuildBowl={() => navigate("/kiosk/order")}
        onGoToCart={() => navigate("/kiosk/summary")}
      />
    </div>
  );
}