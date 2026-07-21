"use client";
import { useEffect, useRef } from "react";
import QRCode from "qrcode";
export function QrCode({ value, label }: { value: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current && value) void QRCode.toCanvas(ref.current, value, { width: 220, margin: 2, color: { dark: "#1A3B5C", light: "#FFFFFF" }, errorCorrectionLevel: "M" }); }, [value]);
  return <canvas className="qr-code" ref={ref} role="img" aria-label={label} />;
}
