import { useEffect, useRef, useState } from "react";
import ui from "./MemberQrScanner.module.css";

export default function MemberQrScanner({ busy = false, onDetected, onClose }) {
  const videoRef = useRef(null);
  const scanLockedRef = useRef(false);
  const [manualValue, setManualValue] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    let stream = null;
    let frame = null;
    let stopped = false;

    const start = async () => {
      if (!("BarcodeDetector" in window)) {
        setCameraError("Este navegador no puede leer QR con la cámara. Usa un lector USB o pega el contenido abajo.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("La cámara no está disponible en este dispositivo.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

        const detect = async () => {
          if (stopped || scanLockedRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes.find((code) => code.rawValue)?.rawValue;
            if (value) {
              scanLockedRef.current = true;
              setScanError("");
              await onDetected(value);
              return;
            }
          } catch (error) {
            // A frame can fail while the camera is focusing; keep scanning.
            scanLockedRef.current = false;
            if (error?.message) setScanError(error.message);
          }
          frame = window.requestAnimationFrame(detect);
        };
        frame = window.requestAnimationFrame(detect);
      } catch {
        setCameraError("No se pudo abrir la cámara. Revisa el permiso del navegador o usa un lector USB.");
      }
    };

    start();
    return () => {
      stopped = true;
      if (frame) window.cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onDetected]);

  const submitManual = async (event) => {
    event.preventDefault();
    const value = manualValue.trim();
    if (!value || busy) return;
    scanLockedRef.current = true;
    setScanError("");
    try {
      await onDetected(value);
    } catch (error) {
      setScanError(error.message || "No se pudo identificar el QR");
    } finally {
      scanLockedRef.current = false;
    }
  };

  return (
    <div className={ui.backdrop} role="dialog" aria-modal="true" aria-labelledby="member-scanner-title">
      <div className={ui.modal}>
        <div className={ui.header}>
          <div>
            <span>Rewards</span>
            <h2 id="member-scanner-title">Escanear QR del miembro</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar escáner">×</button>
        </div>

        <div className={ui.camera}>
          <video ref={videoRef} muted playsInline />
          <div className={ui.target} aria-hidden="true" />
          {busy && <div className={ui.busy}>Identificando miembro…</div>}
        </div>
        <p className={ui.help}>Coloca dentro del recuadro el QR que aparece en “Mi cuenta”.</p>
        {cameraError && <p className={ui.warning}>{cameraError}</p>}
        {scanError && <p className={ui.warning} role="alert">{scanError}</p>}

        <form className={ui.manual} onSubmit={submitManual}>
          <label htmlFor="member-qr-value">Lector USB o ingreso manual</label>
          <div>
            <input
              id="member-qr-value"
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              placeholder="Escanea o pega el código"
              autoComplete="off"
              autoFocus={Boolean(cameraError)}
            />
            <button type="submit" disabled={!manualValue.trim() || busy}>Identificar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
