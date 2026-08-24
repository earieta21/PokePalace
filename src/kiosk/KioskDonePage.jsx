import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import RewardQrCode from "../components/RewardQrCode";

// Con QR se deja más tiempo en pantalla para que la persona alcance a
// sacar su celular y escanear antes de que el kiosco vuelva al inicio.
const AUTO_RESET_MS = 25000;

export default function KioskDonePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const shortCode = location.state?.shortCode;
  const total = location.state?.total;
  const orderId = location.state?.orderId;
  const orderToken = location.state?.orderToken;
  const trackingUrl = orderId && orderToken
    ? `${window.location.origin}/seguimiento/${orderId}?ot=${orderToken}`
    : null;

  useEffect(() => {
    const id = setTimeout(() => navigate("/kiosk", { replace: true }), AUTO_RESET_MS);
    return () => clearTimeout(id);
  }, [navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: 24,
        textAlign: "center",
        background: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 60%)",
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: "#16a34a",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 42,
        }}
      >
        ✓
      </div>

      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: "#1a1a1a" }}>
        ¡Pedido enviado!
      </h1>

      {shortCode && (
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#16a34a" }}>
          Tu código: #{shortCode}
        </p>
      )}

      {total != null && (
        <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#1a1a1a" }}>
          ${total.toFixed(2)}
        </p>
      )}

      <p style={{ margin: 0, fontSize: 16, color: "#555", maxWidth: 320 }}>
        Pasa a caja para pagar. Te avisaremos cuando esté listo.
      </p>

      {trackingUrl && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            marginTop: 6,
            padding: "16px 20px",
            borderRadius: 16,
            background: "#fff",
            border: "1px solid #e5e5e5",
          }}
        >
          <RewardQrCode
            value={trackingUrl}
            size={150}
            ariaLabel="Código QR para seguir tu pedido desde tu celular"
          />
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
            Escanéalo con tu celular
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#777", maxWidth: 220 }}>
            Así te avisamos ahí mismo, con vibración, en cuanto esté listo.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate("/kiosk", { replace: true })}
        style={{
          marginTop: 12,
          padding: "12px 28px",
          borderRadius: 999,
          border: "1px solid #ddd",
          background: "#fff",
          color: "#555",
          fontWeight: 700,
          fontSize: 13.5,
          cursor: "pointer",
        }}
      >
        Volver al inicio
      </button>
    </div>
  );
}
