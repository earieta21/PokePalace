import { useEffect, useRef, useState } from "react";
import { rewardStatus, rewardStatusLabel } from "../utils/rewardStatus";
import styles from "../pages/Promotions.module.css";

function RewardDialog({ title, children, onClose, busy = false }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className={styles.rewardDialog} aria-labelledby="reward-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id="reward-dialog-title">{title}</h2>{children}
  </dialog>;
}

export function RewardConfirmation({ preview, language, busy, error, onConfirm, onClose }) {
  const es = language !== "en";
  const { reward, points, remainingPoints, validityDays } = preview;
  return <RewardDialog title={es ? "Confirmar canje" : "Confirm redemption"} onClose={onClose} busy={busy}>
    <h3>{reward.icon} {reward.name[language] || reward.name.es}</h3>
    <p>{reward.terms[language] || reward.terms.es}</p>
    <p>{es ? "Un premio por orden. No acumulable con otras promociones." : "One reward per order. Cannot be combined with other promotions."}</p>
    <dl className={styles.confirmationTotals}>
      <div><dt>{es ? "Saldo disponible" : "Available balance"}</dt><dd>{points} pts</dd></div>
      <div><dt>{es ? "Puntos a descontar" : "Points to spend"}</dt><dd>{reward.cost} pts</dd></div>
      <div><dt>{es ? "Saldo después del canje" : "Balance after redemption"}</dt><dd>{Math.max(0, remainingPoints)} pts</dd></div>
    </dl>
    <p>{es ? `El código vence ${validityDays} días después de confirmar. Tu nivel se conserva al gastar puntos.` : `The code expires ${validityDays} days after confirmation. Spending points does not lower your tier.`}</p>
    {remainingPoints < 0 && <p role="alert">{es ? "No tienes suficientes puntos para este premio." : "You do not have enough points for this reward."}</p>}
    {error && <p className={styles.redeemErrorBanner} role="alert">{error}</p>}
    <div className={styles.dialogActions}>
      <button type="button" className={styles.walletSecondary} disabled={busy} onClick={onClose} autoFocus>{es ? "Cancelar" : "Cancel"}</button>
      <button type="button" className={styles.walletPrimary} disabled={busy || remainingPoints < 0} onClick={onConfirm}>{busy ? es ? "Canjeando…" : "Redeeming…" : es ? `Confirmar y usar ${reward.cost} puntos` : `Confirm and use ${reward.cost} points`}</button>
    </div>
  </RewardDialog>;
}

export function RewardCodeDialog({ reward, language, onClose }) {
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const es = language !== "en";
  const status = rewardStatus(reward, now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(reward.code); setMessage(es ? "Código copiado" : "Code copied"); }
    catch { setMessage(es ? "No se pudo copiar. Selecciona el código para copiarlo manualmente." : "Could not copy. Select the code to copy it manually."); }
  };
  return <RewardDialog title={es ? "Tu premio" : "Your reward"} onClose={onClose}>
    <h3>{reward.rewardName}</h3>
    <p>{rewardStatusLabel(status, language)}</p>
    {status === "active" ? <>
      <p className={styles.codeValue}>{reward.code}</p>
      <p>{es ? "Muéstralo en caja para aplicar el premio a tu orden. No se descuentan más puntos." : "Show this code at the counter to apply the reward to your order. No additional points will be spent."}</p>
      {reward.expiresAt && <p>{es ? "Válido hasta" : "Valid until"} {new Date(reward.expiresAt).toLocaleString(es ? "es-MX" : "en-US", { timeZone: "America/Tijuana" })} ({es ? "hora de Tijuana" : "Tijuana time"})</p>}
      <button type="button" className={styles.walletPrimary} onClick={copy}>{es ? "Copiar código" : "Copy code"}</button>
    </> : <p>{es ? "Este premio ya no está disponible para usarlo." : "This reward is no longer available to use."}</p>}
    {message && <p role="status">{message}</p>}
    <button type="button" className={styles.walletSecondary} onClick={onClose} autoFocus>{es ? "Cerrar" : "Close"}</button>
  </RewardDialog>;
}
