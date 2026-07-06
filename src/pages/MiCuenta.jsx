import { useContext, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { useOrder } from "../order/OrderContext";
import { API_URL } from "../config";
import { getItemLabel } from "../order/OrderLabels";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./MiCuenta.module.css";

const getProteinsText = (order, language) => {
  if (Array.isArray(order.proteins) && order.proteins.length > 0) {
    return order.proteins.map((id) => getItemLabel("protein", id, language)).join(", ");
  }
  return order.protein || "-";
};

export default function MiCuenta() {
  const { user, token, isLoggedIn, logout } = useContext(AuthContext);
  const { loadFavorite } = useOrder();
  const { language, t } = useLanguage();
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
        if (!res.ok) throw new Error(data?.msg || data?.message || t("account.loadError"));
        if (res.ok) setOrders(data.orders || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [isLoggedIn, t, token]);

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
            <h2 className={styles.title}>{t("account.title")}</h2>
            <p className={styles.subtitle}>
              {language === "es"
                ? "Revisa tus puntos y pedidos guardados."
                : "Review your points and saved orders."}
            </p>

            <div className={styles.pillRow}>
              <div className={styles.pill}>
                <strong>{t("account.name")}:</strong> {user?.name}
              </div>
              <div className={styles.pill}>
                <strong>{t("common.email")}:</strong> {user?.email}
              </div>
              <div className={styles.pill}>
                <strong>{t("account.points")}:</strong> {user?.points ?? 0}
              </div>
            </div>
          </div>

          <div className={styles.actions}>
            <button className={styles.primaryBtn} onClick={() => navigate("/order")}>
              {t("account.orderNow")}
            </button>
            <button className={styles.ghostBtn} onClick={logout}>
              {t("account.logout")}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === "orders" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("orders")}
          >
            {t("account.history")}
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
              <p className={styles.muted}>{t("account.loading")}</p>
            ) : error ? (
              <p className={styles.muted} role="alert">{error}</p>
            ) : orders.length === 0 ? (
              <p className={styles.muted}>{t("account.noOrders")}</p>
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
                          {t(`account.status.${o.status}`)}
                        </span>
                        <Link to={`/seguimiento/${o._id}`} className={styles.trackLink}>
                          {language === "es" ? "Seguir" : "Track"} →
                        </Link>
                      </div>
                    </div>

                    <p className={styles.line}>
                      <strong>{t("common.base")}:</strong> {o.base ? getItemLabel("base", o.base, language) : t("common.none")}{" "}
                      <span className={styles.muted}>•</span>{" "}
                      <strong>{t("common.proteins")}:</strong> {getProteinsText(o, language)}
                    </p>

                    <p className={styles.line}>
                      <strong>{t("tracking.size")}:</strong>{" "}
                      {o.bowlSize === "large" ? t("summary.large") : t("summary.normal")}
                      {o.total != null ? (
                        <>
                          <span className={styles.muted}> • </span>
                          <strong>{t("common.total")}:</strong> ${o.total} MXN
                        </>
                      ) : null}
                    </p>

                    <p className={styles.line}>
                      <strong>{t("summary.fulfillment")}:</strong>{" "}
                      {o.fulfillment ? t(`account.delivery.${o.fulfillment}`) : t("account.delivery.pickup")}{" "}
                      {o.phone ? (
                        <>
                          <span className={styles.muted}>•</span>{" "}
                          <strong>{t("common.phoneShort")}:</strong> {o.phone}
                        </>
                      ) : null}
                    </p>

                    <p className={styles.line}>
                      <strong>{t("common.complements")}:</strong>{" "}
                      {(o.complements || []).map((id) => getItemLabel("complement", id, language)).join(", ") || t("common.none")}
                    </p>

                    <p className={styles.line}>
                      <strong>{t("common.sauces")}:</strong> {(o.sauces || []).map((id) => getItemLabel("sauce", id, language)).join(", ") || t("common.none")}
                    </p>

                    <p className={styles.line}>
                      <strong>{t("common.toppings")}:</strong>{" "}
                      {(o.toppings || []).map((id) => getItemLabel("topping", id, language)).join(", ") || t("common.none")}
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
                        {fav.bowlSize === "large" ? t("summary.large") : t("summary.normal")}
                      </span>
                    </div>

                    <p className={styles.line}>
                      <strong>{t("common.base")}:</strong> {fav.base ? getItemLabel("base", fav.base, language) : t("common.none")}{" "}
                      <span className={styles.muted}>•</span>{" "}
                      <strong>{t("common.proteins")}:</strong>{" "}
                      {(fav.proteins || []).map((id) => getItemLabel("protein", id, language)).join(", ") || t("common.none")}
                    </p>

                    {fav.complements?.length > 0 && (
                      <p className={styles.line}>
                        <strong>{t("common.complements")}:</strong>{" "}
                        {fav.complements.map((id) => getItemLabel("complement", id, language)).join(", ")}
                      </p>
                    )}

                    {fav.sauces?.length > 0 && (
                      <p className={styles.line}>
                        <strong>{t("common.sauces")}:</strong>{" "}
                        {fav.sauces.map((id) => getItemLabel("sauce", id, language)).join(", ")}
                      </p>
                    )}

                    {fav.toppings?.length > 0 && (
                      <p className={styles.line}>
                        <strong>{t("common.toppings")}:</strong>{" "}
                        {fav.toppings.map((id) => getItemLabel("topping", id, language)).join(", ")}
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
