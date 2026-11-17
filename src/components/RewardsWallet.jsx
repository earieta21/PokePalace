import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "../config";
import { rewardStatus } from "../utils/rewardStatus";
import styles from "../pages/Promotions.module.css";

export default function RewardsWallet({ token, language, revision, onShow }) {
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now());
  const es = language !== "en";
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30000);
    const onFocus = () => { setNow(Date.now()); setRefresh((n) => n + 1); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(tick); window.removeEventListener("focus", onFocus); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`${API_URL}/api/rewards/mine?status=active`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.msg || (es ? "No se pudieron cargar tus premios." : "Could not load your rewards."));
        if (!controller.signal.aborted) { setRewards(data.redemptions || []); setNow(Date.now()); }
      })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, revision, refresh, es]);
  const available = rewards.filter((reward) => rewardStatus(reward, now) === "active");
  return <section className={`${styles.section} ${styles.wallet}`} aria-labelledby="available-rewards-title">
    <div className={styles.walletHeader}>
      <h2 id="available-rewards-title" className={styles.sectionTitle}>{es ? "Mis premios disponibles" : "My available rewards"}</h2>
      <button className={styles.walletSecondary} type="button" onClick={() => setRefresh((n) => n + 1)} disabled={loading}>{es ? "Actualizar premios" : "Refresh rewards"}</button>
    </div>
    <p className={styles.sectionSub}>{es ? "Estos premios ya son tuyos. Mostrar el código no descuenta más puntos." : "These rewards are already yours. Showing a code does not spend more points."}</p>
    {loading && <p role="status">{es ? "Cargando premios…" : "Loading rewards…"}</p>}
    {error && <p className={styles.redeemErrorBanner} role="alert">{error}</p>}
    {!loading && !error && !available.length && <p>{es ? "Aún no tienes premios disponibles. Elige uno en el catálogo cuando tengas los puntos necesarios." : "You have no available rewards yet. Choose one from the catalog when you have enough points."}</p>}
    <ul className={styles.walletList}>{available.map((reward) => <li key={reward._id} className={styles.walletItem}>
      <div><h3>{reward.rewardName}</h3><p>{reward.expiresAt
        ? `${es ? "Vence" : "Expires"} ${new Date(reward.expiresAt).toLocaleString(es ? "es-MX" : "en-US", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Tijuana" })} (${es ? "hora de Tijuana" : "Tijuana time"})`
        : es ? "Sin fecha de vencimiento" : "No expiration date"}</p></div>
      <button type="button" className={styles.walletPrimary} onClick={() => onShow(reward)}>{es ? "Mostrar código" : "Show code"}</button>
    </li>)}</ul>
    <Link className={styles.walletHistory} to="/mi-cuenta?tab=rewards">{es ? "Ver todos mis premios y estados" : "View all my rewards and statuses"}</Link>
  </section>;
}
