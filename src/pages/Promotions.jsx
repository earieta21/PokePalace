import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { API_URL } from "../config";
import { REWARDS } from "../data/rewardsCatalog.js";
import styles from "./Promotions.module.css";

const TIERS = [
  {
    key: "bronze", nameKey: "rewards.bronze", min: 0, max: 99,
    color: "#cd7f32", bg: "rgba(205,127,50,0.10)", icon: "🥉",
    perks: {
      es: ["1 punto por cada $10 MXN gastados", "Canje de puntos por premios"],
      en: ["1 point for every $10 MXN spent", "Redeem points for rewards"],
    },
  },
  {
    key: "silver", nameKey: "rewards.silver", min: 100, max: 299,
    color: "#8a8aaa", bg: "rgba(138,138,170,0.10)", icon: "🥈",
    perks: {
      es: ["1 punto por cada $10 MXN gastados", "Nivel Plata permanente"],
      en: ["1 point for every $10 MXN spent", "Permanent Silver tier"],
    },
  },
  {
    key: "gold", nameKey: "rewards.gold", min: 300, max: Infinity,
    color: "#d4a017", bg: "rgba(212,160,23,0.10)", icon: "🥇",
    perks: {
      es: ["2 puntos por cada $10 MXN gastados", "Nivel Oro permanente"],
      en: ["2 points for every $10 MXN spent", "Permanent Gold tier"],
    },
  },
];

function getCurrentTier(points) {
  return [...TIERS].reverse().find((t) => points >= t.min) ?? TIERS[0];
}

function getNextTier(points) {
  return TIERS.find((t) => t.min > points) ?? null;
}

export default function RewardsPage() {
  const { isLoggedIn, user, token, refreshUser } = useContext(AuthContext);
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const [redeeming, setRedeeming] = useState(null);   // reward.id currently in flight
  const [redeemError, setRedeemError] = useState("");
  const [wonCode, setWonCode] = useState(null);        // { code, rewardName, expiresAt }
  const [completedOrderCount, setCompletedOrderCount] = useState(null);

  // Reconcile recent paid/completed purchases that may have missed the old
  // "Cobrado" step, then refresh the visible balance. The backend guards each
  // order so opening this page repeatedly can never duplicate points.
  useEffect(() => {
    if (!isLoggedIn || !token) return undefined;
    const controller = new AbortController();

    fetch(`${API_URL}/api/rewards/reconcile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(() => refreshUser?.())
      .catch((error) => {
        if (error.name !== "AbortError") refreshUser?.();
      });

    return () => controller.abort();
    // refreshUser is intentionally omitted: AuthContext recreates the function
    // after each user update, which would otherwise start a reconciliation loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, token]);

  // Personalization uses existing account orders only. It creates no new
  // customer profile fields and never changes prices or awards extra benefits.
  useEffect(() => {
    if (!isLoggedIn || !token) {
      setCompletedOrderCount(null);
      return;
    }

    const controller = new AbortController();
    fetch(`${API_URL}/api/orders/mine`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) return;
        const completed = (data.orders || []).filter((order) => order.status === "completed");
        setCompletedOrderCount(completed.length);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setCompletedOrderCount(null);
      });

    return () => controller.abort();
  }, [isLoggedIn, token]);

  const points = user?.points ?? 0;                   // saldo gastable — sube y baja
  const lifetimePoints = user?.lifetimePoints ?? 0;    // nivel — logro permanente, solo sube
  const tier = getCurrentTier(lifetimePoints);
  const nextTier = getNextTier(lifetimePoints);

  const tierProgress = nextTier
    ? Math.round(((lifetimePoints - tier.min) / (nextTier.min - tier.min)) * 100)
    : 100;

  const sortedRewards = [...REWARDS].sort((a, b) => a.cost - b.cost);
  const readyReward = sortedRewards.find((reward) => points >= reward.cost) || null;
  const nextReward = sortedRewards.find((reward) => points < reward.cost) || null;
  const personalGoal = readyReward || nextReward || sortedRewards[0];
  const pointsMissing = nextReward ? nextReward.cost - points : 0;
  const earnRate = tier.key === "gold" ? 2 : 1;
  const estimatedSpend = pointsMissing > 0 ? Math.ceil(pointsMissing / earnRate) * 10 : 0;
  const goalProgress = personalGoal
    ? Math.min(100, Math.round((points / personalGoal.cost) * 100))
    : 0;
  const favoriteName = user?.favoriteBowls?.[0]?.name || null;
  const firstName = user?.name?.trim().split(/\s+/)[0] || "";

  const handleRedeem = async (reward) => {
    if (points < reward.cost || redeeming) return;
    setRedeeming(reward.id);
    setRedeemError("");
    try {
      const res = await fetch(`${API_URL}/api/rewards/redeem`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rewardId: reward.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || t("rewards.redeemError"));

      setWonCode({
        code: data.redemption.code,
        rewardName: reward.name[language],
        expiresAt: data.redemption.expiresAt,
      });
      await refreshUser();
    } catch (e) {
      setRedeemError(e.message);
    } finally {
      setRedeeming(null);
    }
  };

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t("rewards.title")}</h1>
        <p className={styles.pageSubtitle}>{t("rewards.subtitle")}</p>
      </div>

      {/* ── Points card ── */}
      {isLoggedIn ? (
        <div className={styles.pointsCard} style={{ borderColor: tier.color }}>
          <div className={styles.pointsLeft}>
            <span className={styles.tierIcon}>{tier.icon}</span>
            <div>
              <p className={styles.tierName} style={{ color: tier.color }}>{t(tier.nameKey)}</p>
              <p className={styles.pointsValue}>{points} <span className={styles.pointsLabel}>{t("rewards.points")}</span></p>
              <p className={styles.pointsSubcaption}>{t("rewards.lifetimeCaption", { points: lifetimePoints })}</p>
            </div>
          </div>
          {nextTier && (
            <div className={styles.pointsRight}>
              <p className={styles.nextLabel}>
                {t("rewards.nextTier", {
                  points: nextTier.min - lifetimePoints,
                  icon: nextTier.icon,
                  name: t(nextTier.nameKey),
                })}
              </p>
              <div className={styles.tierBar}>
                <div className={styles.tierBarFill} style={{ width: `${tierProgress}%`, background: tier.color }} />
              </div>
            </div>
          )}
          {!nextTier && (
            <p className={styles.maxLabel}>{t("rewards.maxTier")}</p>
          )}
        </div>
      ) : (
        <div className={styles.loginBanner}>
          <p>{t("rewards.loginPrompt")}</p>
          <button className={styles.loginBtn} onClick={() => navigate("/login")}>
            {t("more.login")}
          </button>
        </div>
      )}

      {/* ── Personalized guidance without extra discounts ── */}
      {isLoggedIn && personalGoal && (
        <section className={`${styles.section} ${styles.personalCard}`}>
          <div className={styles.personalTopRow}>
            <div>
              <p className={styles.personalEyebrow}>
                {language === "es" ? `Recomendado para ti${firstName ? `, ${firstName}` : ""}` : `Recommended for you${firstName ? `, ${firstName}` : ""}`}
              </p>
              <h2 className={styles.personalTitle}>
                {readyReward
                  ? (language === "es" ? `Ya puedes canjear: ${readyReward.name.es}` : `Ready to redeem: ${readyReward.name.en}`)
                  : (language === "es" ? `Tu siguiente meta: ${nextReward.name.es}` : `Your next goal: ${nextReward.name.en}`)}
              </h2>
              <p className={styles.personalLead}>
                {readyReward
                  ? (language === "es"
                      ? "Usa los puntos que ya ganaste; no necesitas esperar una promoción adicional."
                      : "Use the points you already earned; there is no need to wait for another promotion.")
                  : (language === "es"
                      ? `Te faltan ${pointsMissing} puntos, equivalentes a aproximadamente $${estimatedSpend} MXN en compras futuras.`
                      : `You need ${pointsMissing} more points, about $${estimatedSpend} MXN in future purchases.`)}
              </p>
            </div>
            <span className={styles.personalRewardIcon} aria-hidden="true">{personalGoal.icon}</span>
          </div>

          <div className={styles.personalProgress}>
            <div className={styles.personalProgressTrack}>
              <div className={styles.personalProgressFill} style={{ width: `${goalProgress}%` }} />
            </div>
            <span>{points} / {personalGoal.cost} pts</span>
          </div>

          <div className={styles.personalFacts}>
            <div>
              <strong>{completedOrderCount ?? "—"}</strong>
              <span>{language === "es" ? "Pedidos completados en tu cuenta" : "Completed account orders"}</span>
            </div>
            <div>
              <strong>{tier.icon} {t(tier.nameKey)}</strong>
              <span>{language === "es" ? `${earnRate} ${earnRate === 1 ? "punto" : "puntos"} por cada $10` : `${earnRate} ${earnRate === 1 ? "point" : "points"} per $10`}</span>
            </div>
            <div>
              <strong>{favoriteName || (language === "es" ? "Aún sin favorito" : "No favorite yet")}</strong>
              <span>{language === "es" ? "Bowl guardado para ordenar más rápido" : "Saved bowl for faster ordering"}</span>
            </div>
          </div>

          <div className={styles.personalActions}>
            <a className={styles.personalPrimary} href="#rewards-catalog">
              {readyReward
                ? (language === "es" ? "Ver premio disponible" : "View available reward")
                : (language === "es" ? "Ver mi progreso" : "View my progress")}
            </a>
            <button className={styles.personalSecondary} type="button" onClick={() => navigate(favoriteName ? "/mi-cuenta" : "/order")}>
              {favoriteName
                ? (language === "es" ? "Ver mi bowl favorito" : "View my favorite bowl")
                : (language === "es" ? "Armar mi bowl" : "Build my bowl")}
            </button>
          </div>
        </section>
      )}

      {/* ── Social story campaign ── */}
      <section className={`${styles.section} ${styles.storyCampaign}`}>
        <div className={styles.storyCampaignHeader}>
          <span className={styles.storyCampaignIcon} aria-hidden="true">📲</span>
          <div>
            <p className={styles.storyCampaignEyebrow}>
              {language === "es" ? "Comparte y vuelve" : "Share and come back"}
            </p>
            <h2 className={styles.storyCampaignTitle}>
              {language === "es" ? "Sube una historia y recibe una bebida" : "Post a story and get a drink"}
            </h2>
            <p className={styles.storyCampaignLead}>
              {language === "es"
                ? "Comparte tu bowl, etiqueta la cuenta oficial de Poke Palace y recibe un código para tu próxima visita."
                : "Share your bowl, tag the official Poke Palace account, and get a code for your next visit."}
            </p>
          </div>
        </div>

        <ol className={styles.storySteps}>
          <li><span>1</span>{language === "es" ? "Sube una historia pública mostrando tu producto." : "Post a public story showing your product."}</li>
          <li><span>2</span>{language === "es" ? "Etiqueta la cuenta oficial de Poke Palace." : "Tag the official Poke Palace account."}</li>
          <li><span>3</span>{language === "es" ? "Incluye #PromocionPokePalace para indicar que recibes un beneficio." : "Include #PokePalacePromotion to disclose the benefit."}</li>
          <li><span>4</span>{language === "es" ? "Muéstrala al personal mientras siga activa y recibe tu código." : "Show it to staff while it is active and receive your code."}</li>
        </ol>

        <div className={styles.storyTerms}>
          <strong>{language === "es" ? "Condiciones" : "Terms"}</strong>
          <p>
            {language === "es"
              ? "Agua de coco o limonada de matcha gratis en la siguiente visita con la compra de un bowl · Código válido por 7 días · Una participación por cuenta cada 30 días · No acumulable · Sujeto a disponibilidad."
              : "Free coconut water or matcha lemonade on your next visit with a bowl purchase · Code valid for 7 days · One entry per account every 30 days · Cannot be combined · Subject to availability."}
          </p>
        </div>
      </section>

      {/* ── Recompensas canjeables ── */}
      <section id="rewards-catalog" className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("rewards.redeemTitle")}</h2>
        <p className={styles.sectionSub}>{t("rewards.rate")}</p>
        <p className={styles.sectionSub}>
          {language === "es" ? "Un premio por orden · No acumulable con otras promociones" : "One reward per order · Cannot be combined with other promotions"}
        </p>
        {redeemError && (
          <p className={styles.redeemErrorBanner} role="alert">{redeemError}</p>
        )}
        <div className={styles.rewardsGrid}>
          {REWARDS.map((r) => {
            const canRedeem = isLoggedIn && points >= r.cost;
            const pct = isLoggedIn ? Math.min(100, Math.round((points / r.cost) * 100)) : 0;
            const isBusy = redeeming === r.id;
            return (
              <div key={r.id} className={`${styles.rewardCard} ${canRedeem ? styles.rewardReady : ""}`}>
                <div className={styles.rewardIcon}>{r.icon}</div>
                <p className={styles.rewardName}>{r.name[language]}</p>
                <p className={styles.rewardDesc}>{r.desc[language]}</p>
                <p className={styles.rewardTerms}>{r.terms[language]}</p>

                <div className={styles.rewardProgress}>
                  <div className={styles.rewardBar}>
                    <div className={styles.rewardBarFill} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={styles.rewardCost}>{r.cost} pts</span>
                </div>

                <button
                  className={`${styles.redeemBtn} ${canRedeem ? styles.redeemActive : ""}`}
                  onClick={() => handleRedeem(r)}
                  disabled={!canRedeem || isBusy}
                >
                  {isBusy
                    ? t("rewards.redeeming")
                    : canRedeem
                      ? t("rewards.redeem")
                      : t("rewards.missing", { points: r.cost - points })}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Niveles de lealtad ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("rewards.tiersTitle")}</h2>
        <p className={styles.sectionSub}>{t("rewards.tiersSub")}</p>
        <div className={styles.tiersGrid}>
          {TIERS.map((tierItem) => {
            const isActive = tier.key === tierItem.key;
            return (
              <div
                key={tierItem.key}
                className={`${styles.tierCard} ${isActive ? styles.tierActive : ""}`}
                style={isActive ? { borderColor: tierItem.color, background: tierItem.bg } : {}}
              >
                <div className={styles.tierCardIcon}>{tierItem.icon}</div>
                <p className={styles.tierCardName} style={{ color: tierItem.color }}>{t(tierItem.nameKey)}</p>
                <p className={styles.tierRange}>
                  {tierItem.max === Infinity ? `${tierItem.min}+ pts` : `${tierItem.min}–${tierItem.max} pts`}
                </p>
                <ul className={styles.perkList}>
                  {tierItem.perks[language].map((p) => (
                    <li key={p} className={styles.perkItem}>✓ {p}</li>
                  ))}
                </ul>
                {isActive && <div className={styles.activePill} style={{ background: tierItem.color }}>{t("rewards.currentTier")}</div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Cómo ganar puntos ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("rewards.howTitle")}</h2>
        <div className={styles.howGrid}>
          {[
            {
              icon: "🥗",
              title: language === "es" ? "Ordena en línea" : "Order online",
              desc: language === "es" ? "Gana 1 punto por cada $10 MXN en tu pedido." : "Earn 1 point for every $10 MXN in your order.",
            },
            {
              icon: "⭐",
              title: language === "es" ? "Sé cliente frecuente" : "Be a regular",
              desc: language === "es" ? "Llega a nivel Oro y gana puntos dobles." : "Reach Gold tier and earn double points.",
            },
            {
              icon: "🎟️",
              title: language === "es" ? "Canjea tus puntos" : "Redeem your points",
              desc: language === "es" ? "Elige un premio y recibe un código para mostrar en caja." : "Choose a reward and get a code to show at the counter.",
            },
          ].map((item) => (
            <div key={item.title} className={styles.howCard}>
              <span className={styles.howIcon}>{item.icon}</span>
              <p className={styles.howTitle}>{item.title}</p>
              <p className={styles.howDesc}>{item.desc}</p>
            </div>
          ))}
        </div>
        {!isLoggedIn && (
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <button className={styles.loginBtn} onClick={() => navigate("/order")}>
              {t("rewards.orderNow")}
            </button>
          </div>
        )}
      </section>

      {wonCode && (
        <div className={styles.codeOverlay} onClick={() => setWonCode(null)}>
          <div className={styles.codeModal} onClick={(e) => e.stopPropagation()}>
            <p className={styles.codeCheckmark}>✓</p>
            <p className={styles.codeTitle}>{t("rewards.wonTitle")}</p>
            <p className={styles.codeRewardName}>{wonCode.rewardName}</p>
            <p className={styles.codeValue}>{wonCode.code}</p>
            <p className={styles.codeHint}>{t("rewards.codeHint")}</p>
            {wonCode.expiresAt && (
              <p className={styles.codeExpiry}>
                {t("rewards.expiresOn", { date: new Date(wonCode.expiresAt).toLocaleDateString(language === "es" ? "es-MX" : "en-US") })}
              </p>
            )}
            <button className={styles.codeCloseBtn} onClick={() => setWonCode(null)}>
              {t("rewards.gotIt")}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
