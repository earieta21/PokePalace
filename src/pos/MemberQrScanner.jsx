import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import ui from "./MemberQrScanner.module.css";

export default function MemberQrScanner({ busy = false, onDetected, onClose }) {
  const videoRef = useRef(null);
  const scanLockedRef = useRef(false);
  const lastDetectedRef = useRef("");
  const [manualValue, setManualValue] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    let stream = null;
    let frame = null;
    let stopped = false;
    let nativeDetector = null;
    let lastSoftwareScanAt = 0;
    const scanCanvas = document.createElement("canvas");
    const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });

    const start = async () => {
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

        if ("BarcodeDetector" in window) {
          try {
            nativeDetector = new window.BarcodeDetector({ formats: ["qr_code"] });
          } catch {
            nativeDetector = null;
          }
        }

        const readWithSoftware = (timestamp) => {
          // Keep desktop POS devices responsive while resolving a QR shown on
          // a phone. The native detector remains preferred when available.
          if (!scanContext || timestamp - lastSoftwareScanAt < 160) return "";
          lastSoftwareScanAt = timestamp;

          const sourceWidth = videoRef.current?.videoWidth || 0;
          const sourceHeight = videoRef.current?.videoHeight || 0;
          if (!sourceWidth || !sourceHeight) return "";

          const scale = Math.min(1, 800 / Math.max(sourceWidth, sourceHeight));
          const width = Math.max(1, Math.round(sourceWidth * scale));
          const height = Math.max(1, Math.round(sourceHeight * scale));
          if (scanCanvas.width !== width) scanCanvas.width = width;
          if (scanCanvas.height !== height) scanCanvas.height = height;
          scanContext.drawImage(videoRef.current, 0, 0, width, height);
          const image = scanContext.getImageData(0, 0, width, height);
          return jsQR(image.data, width, height, { inversionAttempts: "dontInvert" })?.data || "";
        };

        const detect = async (timestamp = 0) => {
          if (stopped || scanLockedRef.current) return;
          try {
            let value = "";
            if (nativeDetector) {
              try {
                const codes = await nativeDetector.detect(videoRef.current);
                value = codes.find((code) => code.rawValue)?.rawValue || "";
              } catch {
                // Some desktop Chromium versions expose the constructor but
                // cannot decode QR. Fall back permanently to the JS reader.
                nativeDetector = null;
              }
            }
            if (!nativeDetector && !value) value = readWithSoftware(timestamp);

            if (value && value !== lastDetectedRef.current) {
              scanLockedRef.current = true;
              lastDetectedRef.current = value;
              setScanError("");
              await onDetected(value);
              return;
            }
          } catch (error) {
            // Keep the modal open so a different or refreshed QR can be shown.
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
