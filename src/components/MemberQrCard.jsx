import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../config";
import RewardQrCode from "./RewardQrCode";
import styles from "./MemberQrCard.module.css";

export default function MemberQrCard({ token, onBalanceRefresh }) {
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCard = useCallback(async () => {
    if (!token || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/rewards/member-card`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.msg || data?.message || "No se pudo generar tu QR");
      setCard(data);
      onBalanceRefresh?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [loading, onBalanceRefresh, token]);

  useEffect(() => {
    if (!open || card || loading || error) return;
    loadCard();
  }, [card, error, loadCard, loading, open]);

  useEffect(() => {
    if (!open || !card?.expiresAt) return undefined;
    const refreshIn = Math.max(5_000, new Date(card.expiresAt).getTime() - Date.now() - 30_000);
    const timer = window.setTimeout(() => {
      setCard(null);
    }, refreshIn);
    return () => window.clearTimeout(timer);
  }, [card?.expiresAt, open]);

  const toggle = () => {
    setOpen((current) => !current);
    setError("");
  };

  return (
    <section className={styles.memberCard} aria-label="Tarjeta de miembro Rewards">
      <button type="button" className={styles.toggle} onClick={toggle} aria-expanded={open}>
        <span>
          <strong>Mi QR Rewards</strong>
          <small>Muéstralo en caja para sumar o usar puntos</small>
        </span>
        <span aria-hidden="true">{open ? "−" : "QR"}</span>
      </button>

      {open && (
        <div className={styles.content}>
          {loading && !card && <p>Generando código seguro…</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          {card?.memberQrPayload && (
            <>
              <RewardQrCode
                value={card.memberQrPayload}
                size={230}
                className={styles.qr}
                ariaLabel="Código QR de miembro de Poke Palace"
              />
              <strong>{card.member?.name}</strong>
              <span>{card.member?.points ?? 0} puntos disponibles</span>
              <small>Este QR se actualiza automáticamente por seguridad.</small>
            </>
          )}
          {!loading && (
            <button type="button" className={styles.refresh} onClick={() => { setCard(null); loadCard(); }}>
              Actualizar QR
            </button>
          )}
        </div>
      )}
    </section>
  );
}
