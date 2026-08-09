"use client";

import { useEffect } from "react";
import { INPUT_MODE_EVENT, INPUT_MODE_STORAGE_KEY, LEGACY_PEN_MODE_STORAGE_KEY } from "@/lib/input-mode";

export function InputModeTracker() {
  useEffect(() => {
    const detectPen = (event: PointerEvent) => {
      if (event.pointerType !== "pen") return;
      try {
        localStorage.setItem(INPUT_MODE_STORAGE_KEY, "pen");
        localStorage.setItem(LEGACY_PEN_MODE_STORAGE_KEY, "1");
      } catch {}
      window.dispatchEvent(new CustomEvent(INPUT_MODE_EVENT, { detail: "pen" }));
    };
    window.addEventListener("pointerdown", detectPen, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", detectPen, true);
  }, []);
  return null;
}
