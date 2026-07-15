import { useMemo } from "react";
import qrcode from "../vendor/qrcode-generator.js";

export default function RewardQrCode({ value, className = "", size = 220 }) {
  const qrData = useMemo(() => {
    if (!value) return null;

    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();

    const moduleCount = qr.getModuleCount();
    let path = "";
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
      }
    }

    return { moduleCount, path };
  }, [value]);

  if (!qrData) return null;

  const quietZone = 4;
  const viewBoxSize = qrData.moduleCount + quietZone * 2;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`${-quietZone} ${-quietZone} ${viewBoxSize} ${viewBoxSize}`}
      role="img"
      aria-label="Código QR para guardar el premio"
      shapeRendering="crispEdges"
    >
      <rect x={-quietZone} y={-quietZone} width={viewBoxSize} height={viewBoxSize} rx="2" fill="#ffffff" />
      <path d={qrData.path} fill="#111827" />
    </svg>
  );
}

