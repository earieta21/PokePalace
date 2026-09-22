import { useEffect, useRef, useState } from "react";
import RewardQrCode from "../components/RewardQrCode";
import { API_URL } from "../config";
import styles from "./KioskPairingQr.module.css";

const POLL_MS = 2000;

/**
 * Invitación a identificarse en el kiosco sin teclear nada en la pantalla
 * compartida: el cliente escanea el QR con SU celular, se registra o inicia
 * sesión ahí, y esta pantalla recibe su nombre y un token de corta vida para
 * que el pedido quede ligado a su cuenta y acumule puntos.
 */
export default function KioskPairingQr({ onPaired }) {
  const [token, setToken] = useState(null);
  const [failed, setFailed] = useState(false);
  const onPairedRef = useRef(onPaired);
  onPairedRef.current = onPaired;

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/api/kiosk-pairing`, { method: "POST" })
      .then((r) => r.json())
      .then((data) => { if (alive && data?.token) setToken(data.token); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let alive = true;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/kiosk-pairing/${token}`);
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (data.status === "confirmed") {
          clearInterval(timer);
          onPairedRef.current?.(data);
        }
        // "expired" solo significa que el código de 5 min caducó sin que nadie
        // lo escaneara: se pide uno nuevo en vez de dejar un QR muerto.
        if (data.status === "expired") {
          clearInterval(timer);
          setToken(null);
          fetch(`${API_URL}/api/kiosk-pairing`, { method: "POST" })
            .then((r) => r.json())
            .then((fresh) => { if (alive && fresh?.token) setToken(fresh.token); })
            .catch(() => { if (alive) setFailed(true); });
        }
      } catch {
        // Un fallo de red aislado no debe tumbar el QR — se reintenta solo.
      }
    }, POLL_MS);

    return () => { alive = false; clearInterval(timer); };
  }, [token]);

  // Si el kiosco no puede crear el código, simplemente no se muestra nada:
  // el cliente sigue pidiendo como invitado, sin ver un error que no puede
  // resolver.
  if (failed || !token) return null;

  const pairUrl = `${window.location.origin}/pair/${token}`;

  return (
    <div className={styles.card}>
      <div className={styles.qrBox}>
        <RewardQrCode value={pairUrl} size={132} ariaLabel="Código QR para acumular puntos" />
      </div>
      <div className={styles.text}>
        <p className={styles.title}>🎁 Escanea y gana 50 puntos</p>
        <p className={styles.subtitle}>
          Apunta la cámara de tu celular al código. Creas tu cuenta en tu teléfono
          y este pedido acumula puntos automáticamente.
        </p>
        <p className={styles.optional}>Opcional — también puedes seguir sin cuenta.</p>
      </div>
    </div>
  );
}
