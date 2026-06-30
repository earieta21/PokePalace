import { useContext, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { useOrder } from "../order/OrderContext";
import { API_URL } from "../config";
import { PROTEIN_LABELS, BASE_LABELS } from "../order/OrderLabels";
import styles from "./MiCuenta.module.css";

const STATUS_LABEL = {
  pending:   "Recibido",
  preparing: "En preparación",
  ready:     "Listo",
  completed: "Entregado",
  cancelled: "Cancelado",
};

const FULFILLMENT_LABEL = {
  pickup: "Recoger",
  dine_in: "En restaurante",
  delivery: "Delivery",
};

const getProteinsText = (order) => {
  if (Array.isArray(order.proteins) && order.proteins.length > 0) {
    return order.proteins.map((id) => PROTEIN_LABELS[id] ?? id).join(", ");
  }
  return order.protein || "-";
};

export default function MiCuenta() {
  const { user, token, isLoggedIn, logout } = useContext(AuthContext);
  const { loadFavorite } = useOrder();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [favorites, setFavorites] = useState([]);
  const [favLoading, setFavLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [activeTab, setActiveTab] = useState("orders");

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

  useEffect(() => {
    if (!isLoggedIn || activeTab !== "favorites") return;

    (async () => {
      try {
        setFavLoading(true);
        const res = await fetch(`${API_URL}/api/users/me/favorites`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setFavorites(data.favorites || []);
      } catch {
        // silently ignore
      } finally {
        setFavLoading(false);
      }
    })();
  }, [isLoggedIn, token, activeTab]);

  const handleOrderFromFavorite = (fav) => {
    loadFavorite(fav);
    navigate("/order");
  };

  const handleDeleteFavorite = async (favId) => {
    setDeletingId(favId);
    try {
      const res = await fetch(`${API_URL}/api/users/me/favorites/${favId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setFavorites((prev) => prev.filter((f) => f._id !== favId));
      }
    } catch {
      // silently ignore
    } finally {
      setDeletingId(null);
    }
  };

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
            <button className={styles.primaryBtn} onClick={() => navigate("/order")}>
              Ordenar
            </button>
            <button className={styles.ghostBtn} onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === "orders" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("orders")}
          >
            Historial
          </button>
          <button
            className={`${styles.tab} ${activeTab === "favorites" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("favorites")}
          >
            Mis Favoritos
          </button>
        </div>

        {/* Orders tab */}
        {activeTab === "orders" && (
          <>
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
                      <strong>Proteínas:</strong> {getProteinsText(o)}
                    </p>

                    <p className={styles.line}>
                      <strong>Tamaño:</strong>{" "}
                      {o.bowlSize === "large" ? "Bowl grande" : "Bowl normal"}
                    </p>

                    <p className={styles.line}>
                      <strong>Entrega:</strong>{" "}
                      {FULFILLMENT_LABEL[o.fulfillment] ?? o.fulfillment ?? "Recoger"}{" "}
                      {o.phone ? (
                        <>
                          <span className={styles.muted}>•</span>{" "}
                          <strong>Tel:</strong> {o.phone}
                        </>
                      ) : null}
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
          </>
        )}

        {/* Favorites tab */}
        {activeTab === "favorites" && (
          <>
            {favLoading ? (
              <p className={styles.muted}>Cargando favoritos...</p>
            ) : favorites.length === 0 ? (
              <div className={styles.emptyFavorites}>
                <p className={styles.muted}>Aún no tienes bowls favoritos.</p>
                <p className={styles.muted}>
                  Al armar tu pedido, guarda tu bowl como favorito y aparecerá aquí.
                </p>
                <button className={styles.primaryBtn} onClick={() => navigate("/order")}>
                  Armar mi bowl
                </button>
              </div>
            ) : (
              <div className={styles.orders}>
                {favorites.map((fav) => (
                  <div key={fav._id} className={styles.orderCard}>
                    <div className={styles.orderTop}>
                      <p className={styles.favName}>{fav.name}</p>
                      <span className={styles.favSize}>
                        {fav.bowlSize === "large" ? "Bowl grande" : "Bowl normal"}
                      </span>
                    </div>

                    <p className={styles.line}>
                      <strong>Base:</strong> {BASE_LABELS?.[fav.base] || fav.base || "-"}{" "}
                      <span className={styles.muted}>•</span>{" "}
                      <strong>Proteínas:</strong>{" "}
                      {(fav.proteins || []).map((id) => PROTEIN_LABELS[id] ?? id).join(", ") || "-"}
                    </p>

                    {fav.complements?.length > 0 && (
                      <p className={styles.line}>
                        <strong>Complementos:</strong> {fav.complements.join(", ")}
                      </p>
                    )}

                    {fav.sauces?.length > 0 && (
                      <p className={styles.line}>
                        <strong>Salsas:</strong> {fav.sauces.join(", ")}
                      </p>
                    )}

                    {fav.toppings?.length > 0 && (
                      <p className={styles.line}>
                        <strong>Toppings:</strong> {fav.toppings.join(", ")}
                      </p>
                    )}

                    <div className={styles.favActions}>
                      <button
                        className={styles.primaryBtn}
                        onClick={() => handleOrderFromFavorite(fav)}
                      >
                        Pedir de nuevo
                      </button>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDeleteFavorite(fav._id)}
                        disabled={deletingId === fav._id}
                      >
                        {deletingId === fav._id ? "Eliminando…" : "Eliminar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
