import { useContext, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../config";
import styles from "./KioskPair.module.css";

/**
 * Pantalla que abre el celular del cliente al escanear el QR del kiosco.
 * Si ya tiene sesión, liga el pedido de inmediato; si no, lo manda a crear
 * cuenta y regresa aquí para terminar de ligarlo.
 */
export default function KioskPair() {
  const { token } = useParams();
  const { isLoggedIn, token: authToken } = useContext(AuthContext);
  const navigate = useNavigate();

  const [state, setState] = useState("checking"); // checking | done | error
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!isLoggedIn) {
      setState("needsAccount");
      return;
    }
    let alive = true;
    fetch(`${API_URL}/api/kiosk-pairing/${token}/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setState("error");
          setMessage(data?.msg || "No se pudo ligar tu cuenta a este pedido.");
          return;
        }
        setName(data.name || "");
        setState("done");
      })
      .catch(() => {
        if (alive) {
          setState("error");
          setMessage("No hay conexión. Intenta de nuevo.");
        }
      });
    return () => { alive = false; };
  }, [isLoggedIn, authToken, token]);

  const goCreateAccount = () =>
    navigate("/register", { state: { from: `/pair/${token}` } });
  const goLogin = () =>
    navigate("/login", { state: { from: `/pair/${token}` } });

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        {state === "checking" && <p className={styles.muted}>Ligando tu cuenta…</p>}

        {state === "needsAccount" && (
          <>
            <span className={styles.icon} aria-hidden="true">🎁</span>
            <h1 className={styles.title}>Gana 50 puntos con este pedido</h1>
            <p className={styles.subtitle}>
              Crea tu cuenta aquí en tu celular y el pedido que estás haciendo en el
              kiosco acumulará puntos automáticamente.
            </p>
            <button className={styles.primaryBtn} onClick={goCreateAccount}>
              Crear cuenta
            </button>
            <button className={styles.ghostBtn} onClick={goLogin}>
              Ya tengo cuenta
            </button>
          </>
        )}

        {state === "done" && (
          <>
            <span className={styles.icon} aria-hidden="true">✅</span>
            <h1 className={styles.title}>¡Listo{name ? `, ${name}` : ""}!</h1>
            <p className={styles.subtitle}>
              Regresa a la pantalla del kiosco para terminar tu pedido. Tus puntos se
              acumulan solos.
            </p>
          </>
        )}

        {state === "error" && (
          <>
            <span className={styles.icon} aria-hidden="true">😕</span>
            <h1 className={styles.title}>No se pudo ligar</h1>
            <p className={styles.subtitle}>{message}</p>
            <p className={styles.muted}>
              Pide un código nuevo en la pantalla del kiosco y vuelve a escanear.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
