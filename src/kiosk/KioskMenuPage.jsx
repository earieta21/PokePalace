import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useOrder } from "../order/OrderContext";
import { useAvailability } from "../context/AvailabilityContext";
import { PROMO_2X1_BOWLS_PRICE } from "../order/pricing";
import MenuBrowser from "../order/MenuBrowser";
import useIdleTimeout from "./useIdleTimeout";

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

      {/* Promo 2x1 en Bowls — solo martes y jueves (promo2x1Active, ver
          /api/settings/availability), solo para comer en el local. */}
      {promo2x1Active && (
        <div
          style={{
            margin: "16px 16px 0",
            padding: "16px 18px",
            borderRadius: 18,
            background: "linear-gradient(125deg, #14213d 0%, #2c5c94 100%)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.5px", color: "#8ecbff" }}>
              PROMO · 2 BOWLS POR 1
            </p>
            <h2 style={{ margin: "4px 0 2px", fontSize: 20, fontWeight: 800 }}>
              2x1 en Bowls · ${PROMO_2X1_BOWLS_PRICE} MXN
            </h2>
            <p style={{ margin: 0, fontSize: 13, fontStyle: "italic", color: "rgba(255,255,255,0.85)" }}>
              Solo para comer en el restaurante — no aplica para llevar.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartPromo2x1}
            style={{
              padding: "12px 20px",
              borderRadius: 12,
              border: 0,
              background: "#fff",
              color: "#14315c",
              fontWeight: 850,
              fontSize: 14,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Armar mis 2 bowls →
          </button>
        </div>
      )}

      <MenuBrowser
        isKiosk
        onBuildBowl={() => navigate("/kiosk/order")}
        onGoToCart={() => navigate("/kiosk/summary")}
      />
    </div>
  );
}