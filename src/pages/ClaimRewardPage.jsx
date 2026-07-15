import { useContext, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Copy, Gift, LoaderCircle, ShoppingBag } from "lucide-react";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../config";
import styles from "./ClaimRewardPage.module.css";

export default function ClaimRewardPage() {
  const { token } = useContext(AuthContext);
  const [searchParams] = useSearchParams();
  const claimToken = searchParams.get("token") || "";
  const [status, setStatus] = useState("loading");
  const [redemption, setRedemption] = useState(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const claimReward = async () => {
      if (!claimToken) {
        setStatus("error");
        setMessage("Este enlace no contiene un premio válido.");
        return;
      }

      setStatus("loading");
      try {
        const response = await fetch(`${API_URL}/api/rewards/claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ token: claimToken }),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.msg || "No se pudo guardar el premio");

        setRedemption(data.redemption);
        setStatus("success");
      } catch (error) {
        if (error.name === "AbortError") return;
        setMessage(error.message);
        setStatus("error");
      }
    };

    claimReward();
    return () => controller.abort();
  }, [claimToken, token]);

  const copyCode = async () => {
    if (!redemption?.code) return;
    try {
      await navigator.clipboard.writeText(redemption.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-live="polite">
        {status === "loading" && (
          <div className={styles.centerState}>
            <LoaderCircle className={styles.spinner} size={38} aria-hidden="true" />
            <h1>Guardando tu premio…</h1>
            <p>Estamos asociando el código con tu cuenta de Poke Palace.</p>
          </div>
        )}

        {status === "success" && redemption && (
          <>
            <div className={styles.successIcon}><CheckCircle2 size={40} aria-hidden="true" /></div>
            <p className={styles.eyebrow}>Premio guardado</p>
            <h1>¡Tu bebida ya está en tu cuenta!</h1>
            <p className={styles.lead}>
              En tu próxima visita muestra este código al personal y compra un bowl para recibir tu bebida.
            </p>

            <div className={styles.rewardBox}>
              <div className={styles.rewardName}>
                <Gift size={22} aria-hidden="true" />
                <span>{redemption.rewardName}</span>
              </div>
              <button className={styles.codeButton} type="button" onClick={copyCode} aria-label="Copiar código del premio">
                <strong>{redemption.code}</strong>
                <span><Copy size={16} aria-hidden="true" /> {copied ? "Copiado" : "Copiar"}</span>
              </button>
              {redemption.expiresAt && (
                <p className={styles.expiry}>
                  Válido hasta el {new Date(redemption.expiresAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              )}
            </div>

            <div className={styles.actions}>
              <Link className={styles.primaryAction} to="/mi-cuenta?tab=rewards">
                Ver en Mis premios
              </Link>
              <Link className={styles.secondaryAction} to="/order">
                <ShoppingBag size={18} aria-hidden="true" /> Ordenar ahora
              </Link>
            </div>
          </>
        )}

        {status === "error" && (
          <div className={styles.centerState}>
            <div className={styles.errorIcon}><Gift size={34} aria-hidden="true" /></div>
            <h1>No pudimos guardar el premio</h1>
            <p>{message}</p>
            <p className={styles.help}>Si conservas el código de 6 caracteres, todavía puedes mostrarlo directamente en caja.</p>
            <Link className={styles.primaryAction} to="/rewards-deals">Ver mis promociones</Link>
          </div>
        )}
      </section>
    </main>
  );
}

