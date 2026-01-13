import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../config";
import styles from "./MiCuenta.module.css";

export default function MiCuenta() {
  const { user, token, isLoggedIn, logout } = useContext(AuthContext);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/api/orders/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setOrders(data.orders || []);
      } catch {
        // no-op
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
              onClick={() => (window.location.href = "/order")}
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
        ) : orders.length === 0 ? (
          <p className={styles.muted}>Aún no tienes pedidos guardados.</p>
        ) : (
          <div className={styles.orders}>
            {orders.map((o) => (
              <div key={o._id} className={styles.orderCard}>
                <div className={styles.orderTop}>
                  <p className={styles.orderDate}>
                    {new Date(o.createdAt).toLocaleString()}
                  </p>
                  <span className={styles.status}>{o.status}</span>
                </div>

                <p className={styles.line}>
                  <strong>Base:</strong> {o.base || "-"}{" "}
                  <span className={styles.muted}>•</span>{" "}
                  <strong>Protein:</strong> {o.protein || "-"}
                </p>

                <p className={styles.line}>
                  <strong>Complements:</strong>{" "}
                  {(o.complements || []).join(", ") || "-"}
                </p>

                <p className={styles.line}>
                  <strong>Sauces:</strong> {(o.sauces || []).join(", ") || "-"}
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
