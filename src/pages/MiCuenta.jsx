import { useContext, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../config";
import styles from "./MiCuenta.module.css";

const STATUS_LABEL = {
  pending:   "Recibido",
  preparing: "En preparación",
  ready:     "Listo",
  completed: "Entregado",
  cancelled: "Cancelado",
};

export default function MiCuenta() {
  const { user, token, isLoggedIn, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn) return;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`${API_URL}/api/orders/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.msg || data?.message || "No se pudieron cargar tus pedidos.");
        if (res.ok) setOrders(data.orders || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [isLoggedIn, token]);

  if (!isLoggedIn) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <div className={styles.badge}>Poke Palace</div>
            <h2 className={styles.title}>Mi Cuenta</h2>
            <p className={styles.subtitle}>
              Revisa tus puntos y pedidos guardados.
            </p>

            <div className={styles.pillRow}>
              <div className={styles.pill}>
                <strong>Nombre:</strong> {user?.name}
              </div>
              <div className={styles.pill}>
                <strong>Email:</strong> {user?.email}
              </div>
              <div className={styles.pill}>
                <strong>Puntos:</strong> {user?.points ?? 0}
              </div>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.primaryBtn}
              onClick={() => navigate("/order")}
            >
              Ordenar
            </button>
            <button className={styles.ghostBtn} onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </div>

        <h3 className={styles.sectionTitle}>Historial de pedidos</h3>

        {loading ? (
          <p className={styles.muted}>Cargando...</p>
        ) : error ? (
          <p className={styles.muted} role="alert">{error}</p>
        ) : orders.length === 0 ? (
          <p className={styles.muted}>Aún no tienes pedidos guardados.</p>
        ) : (
          <div className={styles.orders}>
            {orders.map((o) => (
              <div key={o._id} className={styles.orderCard}>
                <div className={styles.orderTop}>
                  <p className={styles.orderDate}>
                    {new Date(o.createdAt).toLocaleString("es-MX")}
                  </p>
                  <div className={styles.orderTopRight}>
                    <span className={`${styles.status} ${styles[`status_${o.status}`]}`}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                    <Link to={`/seguimiento/${o._id}`} className={styles.trackLink}>
                      Seguir →
                    </Link>
                  </div>
                </div>

                <p className={styles.line}>
                  <strong>Base:</strong> {o.base || "-"}{" "}
                  <span className={styles.muted}>•</span>{" "}
                  <strong>Proteína:</strong> {o.protein || "-"}
                </p>

                <p className={styles.line}>
                  <strong>Complementos:</strong>{" "}
                  {(o.complements || []).join(", ") || "-"}
                </p>

                <p className={styles.line}>
                  <strong>Salsas:</strong> {(o.sauces || []).join(", ") || "-"}
                </p>

                <p className={styles.line}>
                  <strong>Toppings:</strong>{" "}
                  {(o.toppings || []).join(", ") || "-"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
