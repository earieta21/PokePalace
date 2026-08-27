import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../config";
import RewardQrCode from "./RewardQrCode";
import styles from "./MemberQrCard.module.css";

export default function MemberQrCard({
  token,
  onBalanceRefresh,
  defaultOpen = false,
  language = "es",
  className = "",
}) {
  const [open, setOpen] = useState(defaultOpen);
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

  const copy = language === "en"
    ? {
        title: "My Rewards QR",
        subtitle: "Show it at the counter to earn or use points",
        loading: "Generating secure code…",
        points: "points available",
        security: "This QR refreshes automatically for your security.",
        refresh: "Refresh QR",
        label: "Poke Palace member QR code",
      }
    : {
        title: "Mi QR Rewards",
        subtitle: "Muéstralo en caja para sumar o usar puntos",
        loading: "Generando código seguro…",
        points: "puntos disponibles",
        security: "Este QR se actualiza automáticamente por seguridad.",
        refresh: "Actualizar QR",
        label: "Código QR de miembro de Poke Palace",
      };

  return (
    <section className={`${styles.memberCard} ${className}`} aria-label={copy.title}>
      <button type="button" className={styles.toggle} onClick={toggle} aria-expanded={open}>
        <span>
          <strong>{copy.title}</strong>
          <small>{copy.subtitle}</small>
        </span>
        <span aria-hidden="true">{open ? "−" : "QR"}</span>
      </button>

      {open && (
        <div className={styles.content}>
          {loading && !card && <p>{copy.loading}</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          {card?.memberQrPayload && (
            <>
              <RewardQrCode
                value={card.memberQrPayload}
                size={230}
                className={styles.qr}
                ariaLabel={copy.label}
              />
              <strong>{card.member?.name}</strong>
              <span>{card.member?.points ?? 0} {copy.points}</span>
              <small>{copy.security}</small>
            </>
          )}
          {!loading && (
            <button type="button" className={styles.refresh} onClick={() => { setCard(null); loadCard(); }}>
              {copy.refresh}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
