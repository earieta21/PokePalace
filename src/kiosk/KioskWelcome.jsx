import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOrder } from "../order/OrderContext";

export default function KioskWelcome() {
  const navigate = useNavigate();
  const { resetOrder } = useOrder();

  // Defensive: wipe any leftover selections from the previous customer
  // every time this idle screen is shown.
  useEffect(() => {
    resetOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        onClick={() => navigate("/kiosk/order")}
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
