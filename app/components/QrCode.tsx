"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

type QrVariant = "teacher" | "large" | "personal";

export function QrCode({ value, label, variant = "personal" }: { value: string; label: string; variant?: QrVariant }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!ref.current || !value) return;
    let active = true;
    setError("");
    void QRCode.toCanvas(ref.current, value, { width: 360, margin: 4, color: { dark: "#000000", light: "#FFFFFF" }, errorCorrectionLevel: "M" })
      .catch(() => { if (active) setError("QR 코드를 만들지 못했어요. 입장 주소를 복사해 주세요."); });
    return () => { active = false; };
  }, [value]);
  return <div className={`qr-code-frame qr-code-frame-${variant}`}><canvas className={`qr-code qr-code-${variant}`} ref={ref} role="img" aria-label={label} hidden={Boolean(error)} />{error && <p className="qr-code-error" role="status" aria-live="polite">{error}</p>}</div>;
}
