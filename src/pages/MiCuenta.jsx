import { useContext, useEffect, useState, useCallback } from "react";
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
  const { user, token, isLoggedIn, logout, refreshUser } = useContext(AuthContext);
  const { loadFavorite, reorder } = useOrder();
  const { language, t } = useLanguage();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [favorites, setFavorites] = useState([]);
  const [favLoading, setFavLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [activeTab, setActiveTab] = useState("orders");

  const [redemptions, setRedemptions] = useState([]);
  const [redeemLoading, setRedeemLoading] = useState(false);

  // Refresh points on mount so balance is always current
  useEffect(() => { if (isLoggedIn) refreshUser?.(); }, [isLoggedIn]);

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

  useEffect(() => {
    if (!isLoggedIn || activeTab !== "rewards") return;

    (async () => {
      try {
        setRedeemLoading(true);
        const res = await fetch(`${API_URL}/api/rewards/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setRedemptions(data.redemptions || []);
      } catch {
        // silently ignore
      } finally {
        setRedeemLoading(false);
      }
    })();
  }, [isLoggedIn, token, activeTab]);

  const handleOrderFromFavorite = (fav) => {
    loadFavorite(fav);
    navigate("/order");
  };

  const handleReorder = (pastOrder) => {
    reorder(pastOrder);
    navigate("/summary");
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
            </div>

            {/* Points card */}
            {(() => {
              const pts   = user?.points ?? 0;
              const STEP  = 100;
              const VALUE = 25;
              const filled = pts % STEP;
              const pct    = Math.round((filled / STEP) * 100);
              const rewards = Math.floor(pts / STEP);
              return (
                <div style={{
                  marginTop: 14, padding: "14px 16px",
                  background: "linear-gradient(135deg,#4A7A5A 0%,#6aab82 100%)",
                  borderRadius: 14, color: "#fff",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <p style={{ fontSize: 11, opacity: 0.8, margin: 0, fontWeight: 600, letterSpacing: "0.05em" }}>
                        TUS PUNTOS
                      </p>
                      <p style={{ fontSize: 28, fontWeight: 800, margin: "2px 0 0", lineHeight: 1 }}>
                        {pts.toLocaleString("es-MX")}
                      </p>
                    </div>
                    {rewards > 0 && (
                      <div style={{
                        background: "rgba(255,255,255,0.2)", borderRadius: 8,
                        padding: "4px 10px", fontSize: 12, fontWeight: 700,
                      }}>
                        🎁 {rewards} recompensa{rewards > 1 ? "s" : ""} disponible{rewards > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>

                  <div style={{ height: 6, background: "rgba(255,255,255,0.25)", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{
                      width: `${pct}%`, height: "100%",
                      background: "#fff", borderRadius: 3, transition: "width 600ms",
                    }} />
                  </div>
                  <p style={{ fontSize: 11, opacity: 0.85, margin: 0 }}>
                    {filled < STEP
                      ? `${STEP - filled} puntos más para $${VALUE} MXN de descuento`
                      : `¡Tienes ${rewards} recompensa${rewards > 1 ? "s" : ""} — úsala${rewards > 1 ? "s" : ""} en tu próximo pedido!`
                    }
                  </p>
                  <p style={{ fontSize: 10, opacity: 0.7, margin: "6px 0 0" }}>
                    Gana 1 punto por cada $10 MXN · 100 puntos = $25 MXN
                  </p>
                </div>
              );
            })()}
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
          <button
            className={`${styles.tab} ${activeTab === "rewards" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("rewards")}
          >
            Mis Premios
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

                    {/* Reorder button — only for completed orders with a base */}
                    {o.status === "completed" && o.base && (
                      <div style={{ marginTop: 10 }}>
                        <button
                          className={styles.primaryBtn}
                          onClick={() => handleReorder(o)}
                          style={{ fontSize: 13 }}
                        >
                          🔄 Repetir pedido
                        </button>
                      </div>
                    )}
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

        {/* Rewards tab */}
        {activeTab === "rewards" && (
          <>
            {redeemLoading ? (
              <p className={styles.muted}>Cargando…</p>
            ) : redemptions.length === 0 ? (
              <div className={styles.emptyFavorites}>
                <p className={styles.muted}>Aún no has canjeado ningún premio.</p>
                <p className={styles.muted}>
                  Junta puntos ordenando y canjéalos en la sección de Premios.
                </p>
                <button className={styles.primaryBtn} onClick={() => navigate("/rewards-deals")}>
                  Ver premios
                </button>
              </div>
            ) : (
              <div className={styles.orders}>
                {redemptions.map((r) => (
                  <div key={r._id} className={styles.orderCard}>
                    <div className={styles.orderTop}>
                      <p className={styles.orderDate}>{r.rewardName}</p>
                      <span className={`${styles.status} ${
                        r.status === "used" ? styles.status_completed
                        : r.status === "expired" ? styles.status_cancelled
                        : ""
                      }`}>
                        {r.status === "used" ? "Usado" : r.status === "expired" ? "Vencido" : "Activo"}
                      </span>
                    </div>
                    <p className={styles.rewardCode}>{r.code}</p>
                    <p className={styles.line}>
                      {r.status === "used"
                        ? `Usado el ${new Date(r.usedAt).toLocaleString("es-MX")}`
                        : r.status === "expired"
                        ? "Este código ya venció."
                        : r.expiresAt
                        ? `Válido hasta el ${new Date(r.expiresAt).toLocaleDateString("es-MX")} · muéstralo en el mostrador.`
                        : "Muestra este código en el mostrador para reclamarlo."}
                    </p>
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
