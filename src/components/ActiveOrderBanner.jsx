import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../config";
import {
  ACTIVE_ORDER_STORAGE_KEY,
  clearActiveOrder,
  getActiveOrderId,
  getOrderAccessToken,
} from "../utils/orderAccess";

const POLL_MS = 8000;

const STATUS_CONFIG = {
  pending:   { label: "Pedido recibido",       sub: "Esperando confirmación…", color: "#6b7280", bg: "#f3f4f6", pulse: false },
  preparing: { label: "Preparando tu bowl 👨‍🍳", sub: "8–12 min estimados",     color: "#d97706", bg: "#fffbeb", pulse: false },
  ready:     { label: "¡Tu bowl está listo! 🔔", sub: "Pasa a recogerlo",       color: "#166534", bg: "#dcfce7", pulse: true  },
};

export default function ActiveOrderBanner() {
  const location = useLocation();
  const { token } = useContext(AuthContext);
  const [orderId, setOrderId]   = useState(getActiveOrderId);
  const [order, setOrder]       = useState(null);
  const [loaded, setLoaded]     = useState(false);
  const prevReadyRef            = useRef(false);

  // Re-read orderId from localStorage on every route change (catches same-tab updates)
  useEffect(() => {
    setOrderId(getActiveOrderId());
  }, [location.pathname]);

  // Also listen for cross-tab storage events
  useEffect(() => {
    const handler = (e) => {
      if (e.key === ACTIVE_ORDER_STORAGE_KEY) setOrderId(e.newValue);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const fetchOrder = useCallback(async () => {
    const id = getActiveOrderId();
    if (!id) { setOrder(null); setLoaded(true); return; }
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const orderToken = getOrderAccessToken(id);
      if (orderToken) headers["X-Order-Token"] = orderToken;
      const res = await fetch(`${API_URL}/api/orders/${id}`, { headers });
      if (!res.ok) { clearActiveOrder(); setOrderId(null); setOrder(null); setLoaded(true); return; }
      const data = await res.json();
      const o = data.order;

      // Vibrate on mobile when status becomes ready
      if (o.status === "ready" && !prevReadyRef.current && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
      prevReadyRef.current = o.status === "ready";

      if (o.status === "completed" || o.status === "cancelled") {
        clearActiveOrder();
        setOrderId(null);
        setOrder(null);
      } else {
        setOrder(o);
      }
    } catch {
      // Network error — keep last known state, try again next poll
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    fetchOrder();
    if (!orderId) return;
    const id = setInterval(fetchOrder, POLL_MS);
    return () => clearInterval(id);
  }, [fetchOrder, orderId]);

  // Hide on the tracking page to avoid duplication
  if (location.pathname.startsWith("/seguimiento")) return null;
  // Don't render anything until first fetch resolves
  if (!loaded || !order) return null;

  const cfg = STATUS_CONFIG[order.status];
  if (!cfg) return null;

  return (
    <Link
      to={`/seguimiento/${order._id}`}
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: cfg.bg,
        border: `2px solid ${cfg.color}`,
        borderRadius: 999,
        padding: "10px 18px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        textDecoration: "none",
        maxWidth: "calc(100vw - 32px)",
        width: "max-content",
        animation: cfg.pulse ? "bannerPulse 2s ease-in-out infinite" : "bannerIn 0.3s ease-out",
      }}
    >
      {cfg.pulse && (
        <span style={{
          width: 10, height: 10, borderRadius: "50%",
          background: cfg.color, flexShrink: 0,
          animation: "dot-pulse 1.4s ease-in-out infinite",
        }} />
      )}
      <div style={{ minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 14, fontWeight: 800,
          color: cfg.color, lineHeight: 1.2, whiteSpace: "nowrap",
        }}>
          {cfg.label}
        </p>
        <p style={{
          margin: 0, fontSize: 11, color: cfg.color, opacity: 0.8,
          whiteSpace: "nowrap",
        }}>
          {cfg.sub} · toca para ver
        </p>
      </div>
      <span style={{ fontSize: 16, flexShrink: 0, color: cfg.color }}>→</span>

      <style>{`
        @keyframes bannerIn {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes bannerPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 0 0 0 ${cfg.color}40; }
          50%       { box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 0 0 8px ${cfg.color}00; }
        }
        @keyframes dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </Link>
  );
}
