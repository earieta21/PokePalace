import { useCallback, useContext, useEffect, useState, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { API_URL } from "../config";
import { getRewardGoals, REWARDS, SIGNUP_BONUS_POINTS } from "../data/rewardsCatalog.js";
import { trackEvent } from "../utils/analytics";
import MemberQrCard from "../components/MemberQrCard";
import RewardsWallet from "../components/RewardsWallet";
import { RewardConfirmation, RewardCodeDialog } from "../components/RewardDialogs";
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

const PENDING_REDEMPTION_KEY = "pokePalace.pendingRewardRedemption.v1";
const CLIENT_REDEMPTION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/;

function createClientRedemptionId() {
  if (globalThis.crypto?.randomUUID) return `reward:${globalThis.crypto.randomUUID()}`;
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return `reward:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `reward:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`;
}

function pendingRedemptionKey(userId, rewardId) {
  return `${userId}:${rewardId}`;
}

function loadPendingRedemptions() {
  try {
    const stored = JSON.parse(localStorage.getItem(PENDING_REDEMPTION_KEY) || "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    const valid = {};
    for (const [key, pending] of Object.entries(stored)) {
      if (
        pending &&
        key === pendingRedemptionKey(pending.userId, pending.rewardId) &&
        CLIENT_REDEMPTION_ID_RE.test(pending.clientRedemptionId || "")
      ) {
        valid[key] = pending;
      }
    }
    return valid;
  } catch {
    return {};
  }
}

function savePendingRedemptions(pendingRedemptions) {
  localStorage.setItem(PENDING_REDEMPTION_KEY, JSON.stringify(pendingRedemptions));
}

function savePendingRedemption(key, pending) {
  const latest = loadPendingRedemptions();
  const next = { ...latest, [key]: pending };
  savePendingRedemptions(next);
  return next;
}

function clearPendingRedemption(key) {
  const next = loadPendingRedemptions();
  delete next[key];
  savePendingRedemptions(next);
  return next;
}

function getCurrentTier(points) {
  return [...TIERS].reverse().find((t) => points >= t.min) ?? TIERS[0];
}

function getNextTier(points) {
  return TIERS.find((t) => t.min > points) ?? null;
}

export default function RewardsPage() {
  const { isLoggedIn, user, token, refreshUser, updateRewardsBalance } = useContext(AuthContext);
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [redeeming, setRedeeming] = useState(null);   // reward.id currently in flight
  const [redeemError, setRedeemError] = useState("");
  const [wonCode, setWonCode] = useState(null);        // { code, rewardName, expiresAt }
  const [completedOrderCount, setCompletedOrderCount] = useState(null);
  const [pendingRedemptions, setPendingRedemptions] = useState(loadPendingRedemptions);
  const [confirmation, setConfirmation] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [walletRevision, setWalletRevision] = useState(0);
  const requestBusy = useRef(false);
  const sessionToken = useRef(token);
  sessionToken.current = token;

  useEffect(() => { setConfirmation(null); setWonCode(null); setRedeemError(""); }, [token]);

  useEffect(() => {
    const syncPending = (event) => {
      if (event.key === PENDING_REDEMPTION_KEY) {
        setPendingRedemptions(loadPendingRedemptions());
      }
    };
    window.addEventListener("storage", syncPending);
    return () => window.removeEventListener("storage", syncPending);
  }, []);

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
      .then(() => refreshUser?.({ rewardVisit: true }))
      .catch((error) => {
        if (error.name !== "AbortError") refreshUser?.({ rewardVisit: true });
      });

    return () => controller.abort();
  }, [isLoggedIn, token, refreshUser]);

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

  const { readyReward, nextReward } = getRewardGoals(points);
  const personalGoal = readyReward || nextReward;
  const smallerRewards = readyReward ? REWARDS.filter((reward) => reward.cost < readyReward.cost) : [];
  const pointsMissing = nextReward ? nextReward.cost - points : 0;
  const earnRate = tier.key === "gold" ? 2 : 1;
  const estimatedSpend = pointsMissing > 0 ? Math.ceil(pointsMissing / earnRate) * 10 : 0;
  const goalProgress = personalGoal
    ? Math.min(100, Math.round((points / personalGoal.cost) * 100))
    : 0;
  const favoriteName = user?.favoriteBowls?.[0]?.name || null;
  const firstName = user?.name?.trim().split(/\s+/)[0] || "";
  const accountUserId = String(user?.id || user?._id || "");
  const catalogRewardIds = new Set(REWARDS.map((reward) => reward.id));
  const orphanedPendingRedemptions = Object.values(pendingRedemptions).filter(
    (pending) => pending.userId === accountUserId && !catalogRewardIds.has(pending.rewardId)
  );

  const previewReward = useCallback(async (reward, placement) => {
    if (!accountUserId || requestBusy.current) return;
    requestBusy.current = true; setPreviewing(reward.id); setRedeemError("");
    trackEvent("select_reward", { reward_id: reward.id, placement });
    try {
      const response = await fetch(`${API_URL}/api/rewards/preview/${reward.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.msg || (language === "es" ? "No se pudieron consultar las condiciones." : "Could not load reward terms."));
      if (sessionToken.current !== token) return;
      updateRewardsBalance?.(data.points);
      setConfirmation(data);
    } catch (e) { if (sessionToken.current === token) setRedeemError(e.message); }
    finally { requestBusy.current = false; setPreviewing(null); }
  }, [accountUserId, language, token, updateRewardsBalance]);

  // Links from Mi cuenta open the current terms. Opening a URL never sends a redemption.
  useEffect(() => {
    const id = searchParams.get("reward");
    if (!id || !accountUserId || !token) return;
    const reward = REWARDS.find((entry) => String(entry.id) === id);
    const remaining = new URLSearchParams(searchParams);
    remaining.delete("reward");
    setSearchParams(remaining, { replace: true });
    if (reward) previewReward(reward, "reward_link");
  }, [searchParams, setSearchParams, token, accountUserId, previewReward]);

  const startRedeem = (reward, placement = "catalog") => {
    const key = pendingRedemptionKey(accountUserId, reward.id);
    if (loadPendingRedemptions()[key] || pendingRedemptions[key]) return handleRedeem(reward);
    return previewReward(reward, placement);
  };

  const handleRedeem = async (reward) => {
    const userId = accountUserId;
    if (!userId || requestBusy.current) return;
    const pendingKey = pendingRedemptionKey(userId, reward.id);
    let pending = loadPendingRedemptions()[pendingKey] || pendingRedemptions[pendingKey];
    if (!pending && points < reward.cost) return;

    if (!pending) {
      pending = {
        userId,
        rewardId: reward.id,
        clientRedemptionId: createClientRedemptionId(),
        createdAt: new Date().toISOString(),
        expectedPointsCost: reward.cost,
      };
      try { setPendingRedemptions(savePendingRedemption(pendingKey, pending)); }
      catch {
        setRedeemError(language === "es" ? "No se pudo guardar el intento de canje en este dispositivo. Habilita el almacenamiento e intenta de nuevo." : "Could not save this redemption attempt. Enable browser storage and try again.");
        setConfirmation(null); return;
      }
    }

    requestBusy.current = true;
    setRedeeming(reward.id);
    setRedeemError("");
    try {
      const res = await fetch(`${API_URL}/api/rewards/redeem`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rewardId: reward.id,
          clientRedemptionId: pending.clientRedemptionId,
          ...(Number.isFinite(pending.expectedPointsCost ?? reward.cost) && { expectedPointsCost: pending.expectedPointsCost ?? reward.cost }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (sessionToken.current !== token) return;
      if (!res.ok) {
        const error = new Error(data?.msg || t("rewards.redeemError"));
        error.status = res.status;
        error.retryable = Boolean(data?.retryable || res.status >= 500);
        throw error;
      }

      updateRewardsBalance?.(data.points);
      setWonCode(data.redemption);
      setConfirmation(null);
      setWalletRevision((n) => n + 1);
      if (!data.idempotent) {
        trackEvent("reward_redeemed", { reward_id: reward.id, points_cost: data.redemption.pointsCost });
      }
      try { setPendingRedemptions(clearPendingRedemption(pendingKey)); }
      catch { setRedeemError(language === "es" ? "Tu premio se guardó. No se pudo limpiar el intento en este dispositivo; conserva tu código." : "Your reward was saved. This device could not clear the pending attempt; keep your code."); }
      await refreshUser();
    } catch (e) {
      if (sessionToken.current !== token) return;
      if ([400, 409, 422].includes(e.status) && !e.retryable) {
        try { setPendingRedemptions(clearPendingRedemption(pendingKey)); } catch { /* Keep the same request for safe recovery. */ }
      }
      setConfirmation(null);
      setRedeemError(e.message);
    } finally {
      requestBusy.current = false;
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
        <section className={`${styles.section} ${styles.personalCard}`} aria-labelledby="welcome-reward-title">
          <div className={styles.personalTopRow}>
            <div>
              <p className={styles.personalEyebrow}>{language === "es" ? "Tu premio de bienvenida" : "Your welcome reward"}</p>
              <h2 id="welcome-reward-title" className={styles.personalTitle}>
                {language === "es" ? `Crea tu cuenta y recibe ${SIGNUP_BONUS_POINTS} puntos` : `Create your account and get ${SIGNUP_BONUS_POINTS} points`}
              </h2>
              <p className={styles.personalLead}>
                {language === "es"
                  ? "Canjéalos por un agua del día gratis con la compra de un bowl. Agrega la bebida a tu orden y muestra tu código en caja."
                  : "Redeem them for a free agua fresca of the day with a bowl purchase. Add the drink to your order and show your code at the counter."}
              </p>
              <p className={styles.welcomeTerms}>
                {language === "es" ? "Bono al crear una cuenta nueva · Un premio por orden · No acumulable con otras promociones" : "Bonus for new accounts · One reward per order · Cannot be combined with other promotions"}
              </p>
            </div>
            <span className={styles.personalRewardIcon} aria-hidden="true">🥤</span>
          </div>
          <div className={styles.personalActions}>
            <Link
              className={styles.personalPrimary}
              to="/register"
              state={{ from: "/rewards-deals" }}
              onClick={() => trackEvent("select_rewards_signup", { placement: "welcome_bonus" })}
            >
              {language === "es" ? `Crear cuenta y recibir ${SIGNUP_BONUS_POINTS} puntos` : `Create account and get ${SIGNUP_BONUS_POINTS} points`}
            </Link>
            <Link className={styles.personalSecondary} to="/login" state={{ from: "/rewards-deals" }}>
              {language === "es" ? "Ya tengo cuenta" : "I already have an account"}
            </Link>
          </div>
        </section>
      )}

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
                      ? `Canjéalo por ${readyReward.cost} puntos. ${readyReward.terms.es}`
                      : `Redeem it for ${readyReward.cost} points. ${readyReward.terms.en}`)
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

          <div className={styles.personalActions}>
            {readyReward ? (
              <button
                className={styles.personalPrimary}
                type="button"
                disabled={Boolean(redeeming || previewing)}
                onClick={() => startRedeem(readyReward, "summary")}
              >
                {previewing === readyReward.id
                  ? (language === "es" ? "Consultando condiciones…" : "Loading terms…")
                  : redeeming === readyReward.id
                    ? t("rewards.redeeming")
                    : pendingRedemptions[pendingRedemptionKey(accountUserId, readyReward.id)]
                      ? (language === "es" ? "Reintentar canje" : "Retry redemption")
                      : (language === "es" ? `Canjear: ${readyReward.name.es}` : `Redeem: ${readyReward.name.en}`)}
              </button>
            ) : (
              <a className={styles.personalPrimary} href="#rewards-catalog">
                {language === "es" ? "Ver mi progreso" : "View my progress"}
              </a>
            )}
            <button className={styles.personalSecondary} type="button" onClick={() => navigate(favoriteName ? "/mi-cuenta" : "/order")}>
              {favoriteName
                ? (language === "es" ? "Ver mi bowl favorito" : "View my favorite bowl")
                : (language === "es" ? "Armar mi bowl" : "Build my bowl")}
            </button>
          </div>
          {readyReward && <p className={styles.welcomeTerms}>{language === "es" ? "Revisa las condiciones y confirma antes de usar tus puntos." : "Review the terms and confirm before spending your points."}</p>}
          {smallerRewards.length > 0 && (
            <div className={styles.otherRewards}>
              <p>{language === "es" ? "También puedes elegir" : "Other rewards you can choose"}</p>
              <ul>
                {smallerRewards.map((reward) => (
                  <li key={reward.id}>
                    <button type="button" disabled={Boolean(redeeming || previewing)} onClick={() => previewReward(reward, "summary")}>
                      {reward.name[language]} · {reward.cost} pts
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

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

          {redeemError && <p className={styles.redeemErrorBanner} role="alert">{redeemError}</p>}
        </section>
      )}

      {isLoggedIn && (
        <MemberQrCard
          token={token}
          key={token}
          points={points}
          onBalanceRefresh={refreshUser}
          defaultOpen
          language={language}
          className={styles.rewardsMemberQr}
        />
      )}

      {isLoggedIn && <RewardsWallet key={token} token={token} language={language} revision={walletRevision} onShow={setWonCode} />}

      {/* ── Recompensas canjeables ── */}
      <section id="rewards-catalog" className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("rewards.redeemTitle")}</h2>
        <p className={styles.sectionSub}>{t("rewards.rate")}</p>
        <p className={styles.sectionSub}>
          {language === "es" ? "Un premio por orden · No acumulable con otras promociones" : "One reward per order · Cannot be combined with other promotions"}
        </p>
        {redeemError && !(isLoggedIn && personalGoal) && (
          <p className={styles.redeemErrorBanner} role="alert">{redeemError}</p>
        )}
        {orphanedPendingRedemptions.map((pending) => (
          <div className={styles.pendingRecovery} key={pendingRedemptionKey(pending.userId, pending.rewardId)}>
            <div>
              <strong>{language === "es" ? "Tienes un canje pendiente" : "You have a pending redemption"}</strong>
              <span>{language === "es" ? "Termínalo sin volver a descontar puntos." : "Finish it without deducting points again."}</span>
            </div>
            <button
              type="button"
              className={`${styles.redeemBtn} ${styles.redeemActive}`}
              disabled={Boolean(redeeming || previewing)}
              onClick={() => handleRedeem({ id: pending.rewardId, cost: Infinity, name: {} })}
            >
              {redeeming === pending.rewardId
                ? t("rewards.redeeming")
                : (language === "es" ? "Recuperar mi código" : "Recover my code")}
            </button>
          </div>
        ))}
        <div className={styles.rewardsGrid}>
          {REWARDS.map((r) => {
            const hasPendingRedemption = Boolean(
              accountUserId && pendingRedemptions[pendingRedemptionKey(accountUserId, r.id)]
            );
            const canRedeem = isLoggedIn && (points >= r.cost || hasPendingRedemption);
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
                  onClick={() => startRedeem(r)}
                  disabled={!canRedeem || Boolean(redeeming || previewing)}
                >
                  {previewing === r.id ? (language === "es" ? "Consultando condiciones…" : "Loading terms…") : isBusy
                    ? t("rewards.redeeming")
                    : hasPendingRedemption
                      ? (language === "es" ? "Reintentar canje" : "Retry redemption")
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

      {confirmation && <RewardConfirmation preview={confirmation} language={language} busy={Boolean(redeeming)} error={redeemError} onConfirm={() => handleRedeem(confirmation.reward)} onClose={() => { if (!requestBusy.current) setConfirmation(null); }} />}
      {wonCode && <RewardCodeDialog reward={wonCode} language={language} onClose={() => setWonCode(null)} />}

    </div>
  );
}
