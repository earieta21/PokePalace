import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import styles from "./Promotions.module.css";

const TIERS = [
  {
    name: "Bronce", min: 0, max: 99,
    color: "#cd7f32", bg: "rgba(205,127,50,0.10)", icon: "🥉",
    perks: ["1 punto por cada $1 gastado", "Acceso a recompensas básicas"],
  },
  {
    name: "Plata", min: 100, max: 299,
    color: "#8a8aaa", bg: "rgba(138,138,170,0.10)", icon: "🥈",
    perks: ["1 punto por cada $1 gastado", "5% de descuento en tu cumpleaños", "Acceso anticipado a promociones"],
  },
  {
    name: "Oro", min: 300, max: Infinity,
    color: "#d4a017", bg: "rgba(212,160,23,0.10)", icon: "🥇",
    perks: ["2 puntos por cada $1 gastado", "Topping gratis en cada orden", "10% de descuento en tu cumpleaños"],
  },
];

const REWARDS = [
  { id: 1, cost: 50,  icon: "🥤", name: "Bebida Gratis",   desc: "Agua de coco o limonada de matcha" },
  { id: 2, cost: 75,  icon: "✨", name: "Topping Extra",   desc: "Cualquier topping de tu elección" },
  { id: 3, cost: 150, icon: "🥗", name: "Bowl Gratis",     desc: "Un bowl completo de tu elección" },
  { id: 4, cost: 200, icon: "🐟", name: "Proteína Doble",  desc: "Doble porción de proteína en tu bowl" },
];

function getCurrentTier(points) {
  return [...TIERS].reverse().find((t) => points >= t.min) ?? TIERS[0];
}

function getNextTier(points) {
  return TIERS.find((t) => t.min > points) ?? null;
}

export default function RewardsPage() {
  const { isLoggedIn, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [redeemed, setRedeemed] = useState(null);

  const points = user?.points ?? 0;
  const tier = getCurrentTier(points);
  const nextTier = getNextTier(points);

  const tierProgress = nextTier
    ? Math.round(((points - tier.min) / (nextTier.min - tier.min)) * 100)
    : 100;

  const handleRedeem = (reward) => {
    if (points < reward.cost) return;
    setRedeemed(reward.id);
    setTimeout(() => setRedeemed(null), 3000);
  };

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Premios y Beneficios</h1>
        <p className={styles.pageSubtitle}>Ordena, acumula puntos y canjea recompensas.</p>
      </div>

      {/* ── Points card ── */}
      {isLoggedIn ? (
        <div className={styles.pointsCard} style={{ borderColor: tier.color }}>
          <div className={styles.pointsLeft}>
            <span className={styles.tierIcon}>{tier.icon}</span>
            <div>
              <p className={styles.tierName} style={{ color: tier.color }}>{tier.name}</p>
              <p className={styles.pointsValue}>{points} <span className={styles.pointsLabel}>puntos</span></p>
            </div>
          </div>
          {nextTier && (
            <div className={styles.pointsRight}>
              <p className={styles.nextLabel}>
                Faltan <strong>{nextTier.min - points} pts</strong> para nivel {nextTier.icon} {nextTier.name}
              </p>
              <div className={styles.tierBar}>
                <div className={styles.tierBarFill} style={{ width: `${tierProgress}%`, background: tier.color }} />
              </div>
            </div>
          )}
          {!nextTier && (
            <p className={styles.maxLabel}>¡Nivel máximo alcanzado! 🎉</p>
          )}
        </div>
      ) : (
        <div className={styles.loginBanner}>
          <p>Inicia sesión para ver tus puntos y canjear recompensas.</p>
          <button className={styles.loginBtn} onClick={() => navigate("/login")}>
            Iniciar sesión
          </button>
        </div>
      )}

      {/* ── Recompensas canjeables ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Canjea tus Puntos</h2>
        <p className={styles.sectionSub}>$1 = 1 punto · Los puntos no expiran</p>
        <div className={styles.rewardsGrid}>
          {REWARDS.map((r) => {
            const canRedeem = isLoggedIn && points >= r.cost;
            const pct = isLoggedIn ? Math.min(100, Math.round((points / r.cost) * 100)) : 0;
            const isSuccess = redeemed === r.id;
            return (
              <div key={r.id} className={`${styles.rewardCard} ${canRedeem ? styles.rewardReady : ""}`}>
                <div className={styles.rewardIcon}>{r.icon}</div>
                <p className={styles.rewardName}>{r.name}</p>
                <p className={styles.rewardDesc}>{r.desc}</p>

                <div className={styles.rewardProgress}>
                  <div className={styles.rewardBar}>
                    <div className={styles.rewardBarFill} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={styles.rewardCost}>{r.cost} pts</span>
                </div>

                <button
                  className={`${styles.redeemBtn} ${canRedeem ? styles.redeemActive : ""}`}
                  onClick={() => handleRedeem(r)}
                  disabled={!canRedeem || isSuccess}
                >
                  {isSuccess ? "¡Canjeado! ✓" : canRedeem ? "Canjear" : `Faltan ${r.cost - points} pts`}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Niveles de lealtad ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Niveles de Lealtad</h2>
        <p className={styles.sectionSub}>Sube de nivel ordenando más seguido</p>
        <div className={styles.tiersGrid}>
          {TIERS.map((t) => {
            const isActive = tier.name === t.name;
            return (
              <div
                key={t.name}
                className={`${styles.tierCard} ${isActive ? styles.tierActive : ""}`}
                style={isActive ? { borderColor: t.color, background: t.bg } : {}}
              >
                <div className={styles.tierCardIcon}>{t.icon}</div>
                <p className={styles.tierCardName} style={{ color: t.color }}>{t.name}</p>
                <p className={styles.tierRange}>
                  {t.max === Infinity ? `${t.min}+ pts` : `${t.min}–${t.max} pts`}
                </p>
                <ul className={styles.perkList}>
                  {t.perks.map((p) => (
                    <li key={p} className={styles.perkItem}>✓ {p}</li>
                  ))}
                </ul>
                {isActive && <div className={styles.activePill} style={{ background: t.color }}>Tu nivel actual</div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Cómo ganar puntos ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>¿Cómo Ganar Puntos?</h2>
        <div className={styles.howGrid}>
          {[
            { icon: "🥗", title: "Ordena en línea",       desc: "Gana 1 punto por cada $1 en tu pedido." },
            { icon: "⭐", title: "Sé cliente frecuente",  desc: "Llega a nivel Oro y gana puntos dobles." },
            { icon: "🎂", title: "Cumpleaños",            desc: "Bonus de puntos el mes de tu cumpleaños." },
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
              Ordenar Ahora
            </button>
          </div>
        )}
      </section>

    </div>
  );
}
