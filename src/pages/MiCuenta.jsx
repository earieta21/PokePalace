import { useContext, useEffect, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { useOrder } from "../order/OrderContext";
import { API_URL } from "../config";
import { getItemLabel, getBaseLabel } from "../order/OrderLabels";
import { useLanguage } from "../i18n/LanguageContext";
import styles from "./MiCuenta.module.css";
import { comboPalaceSelectionSummary } from "../data/comboPalace";
import MemberQrCard from "../components/MemberQrCard";
import { rewardStatus, rewardStatusLabel } from "../utils/rewardStatus";
import { getRewardGoals, POINTS_PER_REWARD, REWARD_VALUE_MXN } from "../data/rewardsCatalog";

const getProteinsText = (order, language) => {
  if (Array.isArray(order.proteins) && order.proteins.length > 0) {
    return order.proteins.map((id) => getItemLabel("protein", id, language)).join(", ");
  }
  return order.protein || "-";
};

const cartLineBrief = (line, language) => {
  if (line.kind === "item") {
    const combo = line.catalogId === "combo-palace" ? `: ${comboPalaceSelectionSummary(line)}` : "";
    return `${line.name}${combo} ×${line.qty}`;
  }
  if (line.kind === "promo2x1") {
    const proteinLabel = getItemLabel("protein", line.protein, language);
    return `2x1 en Bowls: ${proteinLabel} (2 bowls)`;
  }
  const proteins = (line.proteins || []).map((id) => getItemLabel("protein", id, language)).join(", ");
  const baseLabel = getBaseLabel(line.bases, line.base, language);
  const size = line.bowlSize === "large" ? "Grande" : "Mediano";
  return `Bowl ${size}: ${proteins} en ${baseLabel}`;
};

export default function MiCuenta() {
  const { user, token, isLoggedIn, logout, refreshUser } = useContext(AuthContext);
  const { loadFavorite, reorder } = useOrder();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [favorites, setFavorites] = useState([]);
  const [favLoading, setFavLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [activeTab, setActiveTab] = useState(
    ["orders", "favorites", "rewards"].includes(searchParams.get("tab"))
      ? searchParams.get("tab")
      : "orders"
  );

  const [redemptions, setRedemptions] = useState([]);
  const [redeemLoading, setRedeemLoading] = useState(false);

  // Refresh points on mount so balance is always current
  useEffect(() => { if (isLoggedIn) refreshUser?.({ rewardVisit: true }); }, [isLoggedIn, refreshUser]);

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

  const es = language === "es";
  const points = user?.points ?? 0;
  const { readyReward, nextReward } = getRewardGoals(points);

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

            <section className={styles.pointsCard} aria-labelledby="account-points-title">
              <h3 id="account-points-title">{es ? "Tus puntos" : "Your points"}</h3>
              <strong className={styles.balance}>{points.toLocaleString(es ? "es-MX" : "en-US")}</strong>
              {readyReward && <>
                <p><strong>{readyReward.name[language]} · {readyReward.cost} pts</strong></p>
                <p>{readyReward.terms[language]}</p>
                <Link className={styles.rewardLink} to={`/rewards-deals?reward=${readyReward.id}`}>
                  {readyReward.type === "free_drink"
                    ? (es ? "Canjear bebida" : "Redeem drink")
                    : (es ? "Canjear premio" : "Redeem reward")}
                </Link>
              </>}
              {!readyReward && nextReward && <>
                <p>{es ? `Te faltan ${nextReward.cost - points} pts para ${nextReward.name.es}.` : `${nextReward.cost - points} more pts to unlock ${nextReward.name.en}.`}</p>
                <Link className={styles.rewardLink} to="/rewards-deals">{es ? "Ver premios" : "View rewards"}</Link>
              </>}
              <p className={styles.discountOption}>
                {es
                  ? `También puedes usar cada ${POINTS_PER_REWARD} puntos para descontar $${REWARD_VALUE_MXN} MXN al hacer tu pedido.`
                  : `You can also use every ${POINTS_PER_REWARD} points for $${REWARD_VALUE_MXN} MXN off at checkout.`}
              </p>
            </section>
            <MemberQrCard key={token} token={token} points={user?.points ?? 0} onBalanceRefresh={refreshUser} language={language} />
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

                    {o.cartItems?.length > 0 ? (
                      <p className={styles.line}>
                        <strong>{language === "es" ? "Pedido" : "Order"}:</strong>{" "}
                        {o.cartItems.map((line, idx) => `${idx > 0 ? " + " : ""}${cartLineBrief(line, language)}`).join("")}
                      </p>
                    ) : (
                      <>
                        <p className={styles.line}>
                          <strong>{t("common.base")}:</strong> {o.base ? getBaseLabel(o.bases, o.base, language) : t("common.none")}{" "}
                          <span className={styles.muted}>•</span>{" "}
                          <strong>{t("common.proteins")}:</strong> {getProteinsText(o, language)}
                        </p>
                        <p className={styles.line}>
                          <strong>{t("tracking.size")}:</strong>{" "}
                          {o.bowlSize === "large" ? t("summary.large") : t("summary.normal")}
                        </p>
                      </>
                    )}

                    {o.total != null && (
                      <p className={styles.line}>
                        <strong>{t("common.total")}:</strong> ${o.total} MXN
                      </p>
                    )}

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

                    {!o.cartItems?.length && (
                      <>
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
                      </>
                    )}

                    {/* Reorder button — only for completed orders with a bowl */}
                    {o.status === "completed" && (o.base || o.cartItems?.length > 0) && (
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
                {redemptions.map((r) => {
                  const status = rewardStatus(r);
                  return (
                  <div key={r._id} className={styles.orderCard}>
                    <div className={styles.orderTop}>
                      <p className={styles.orderDate}>{r.rewardName}</p>
                      <span className={`${styles.status} ${
                        status === "used" ? styles.status_completed
                        : status !== "active" ? styles.status_cancelled
                        : ""
                      }`}>
                        {rewardStatusLabel(status, language)}
                      </span>
                    </div>
                    {status === "active" && <p className={styles.rewardCode}>{r.code}</p>}
                    <p className={styles.line}>
                      {status === "used"
                        ? `Usado el ${new Date(r.usedAt).toLocaleString("es-MX")}`
                        : status === "expired"
                        ? "Este código ya venció."
                        : status === "cancelled" ? "Este premio fue cancelado y no puede usarse."
                        : status === "unavailable" ? "Este premio no está disponible para usarlo."
                        : r.expiresAt
                        ? `Válido hasta el ${new Date(r.expiresAt).toLocaleDateString("es-MX")} · muéstralo en el mostrador.`
                        : "Muestra este código en el mostrador para reclamarlo."}
                    </p>
                  </div>
                ); })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

