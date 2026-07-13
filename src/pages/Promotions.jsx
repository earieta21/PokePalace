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

  // Refresh on mount so el nivel y el saldo estén al día (p. ej. justo tras login)
  useEffect(() => { if (isLoggedIn) refreshUser?.(); }, [isLoggedIn]);

  const points = user?.points ?? 0;                   // saldo gastable — sube y baja
  const lifetimePoints = user?.lifetimePoints ?? 0;    // nivel — logro permanente, solo sube
  const tier = getCurrentTier(lifetimePoints);
  const nextTier = getNextTier(lifetimePoints);

  const tierProgress = nextTier
    ? Math.round(((lifetimePoints - tier.min) / (nextTier.min - tier.min)) * 100)
    : 100;

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

      {/* ── Recompensas canjeables ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("rewards.redeemTitle")}</h2>
        <p className={styles.sectionSub}>{t("rewards.rate")}</p>
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
