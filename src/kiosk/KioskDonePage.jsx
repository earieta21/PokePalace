import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const AUTO_RESET_MS = 8000;

export default function KioskDonePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const shortCode = location.state?.shortCode;
  const total = location.state?.total;

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
