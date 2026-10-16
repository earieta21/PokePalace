import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import RewardQrCode from "../components/RewardQrCode";
import { useHalloweenTheme } from "../data/seasonalTheme";

// Con QR se deja más tiempo en pantalla para que la persona alcance a
// sacar su celular y escanear antes de que el kiosco vuelva al inicio.
const AUTO_RESET_MS = 25000;

const DEFAULT_COLORS = {
  background: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 60%)",
  accent: "#16a34a",
  onAccent: "#fff",
  title: "#1a1a1a",
  body: "#555",
  buttonBorder: "#ddd",
  buttonBg: "#fff",
  buttonText: "#555",
};

// El QR se queda sobre su tarjeta blanca también en Halloween: los
// celulares lo leen mejor con fondo claro.
const HALLOWEEN_COLORS = {
  background: "radial-gradient(circle at 50% 20%, rgba(255, 138, 43, 0.16), transparent 45%), #17111e",
  accent: "#ff8a2b",
  onAccent: "#1d1426",
  title: "#f6ead7",
  body: "#cdbfd8",
  buttonBorder: "rgba(246, 234, 215, 0.3)",
  buttonBg: "transparent",
  buttonText: "#f6ead7",
};

export default function KioskDonePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const shortCode = location.state?.shortCode;
  const total = location.state?.total;
  const orderId = location.state?.orderId;
  const orderToken = location.state?.orderToken;
  const colors = useHalloweenTheme() ? HALLOWEEN_COLORS : DEFAULT_COLORS;
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
        background: colors.background,
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: colors.accent,
          color: colors.onAccent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 42,
        }}
      >
        ✓
      </div>

      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: colors.title }}>
        ¡Pedido enviado!
      </h1>

      {shortCode && (
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.accent }}>
          Tu código: #{shortCode}
        </p>
      )}

      {total != null && (
        <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: colors.title }}>
          ${total.toFixed(2)}
        </p>
      )}

      <p style={{ margin: 0, fontSize: 16, color: colors.body, maxWidth: 320 }}>
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
          border: `1px solid ${colors.buttonBorder}`,
          background: colors.buttonBg,
          color: colors.buttonText,
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
