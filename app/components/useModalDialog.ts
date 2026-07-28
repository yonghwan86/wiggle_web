"use client";

import { RefObject, useEffect, useRef } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

function focusable(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null || element === document.activeElement);
}

// 열린 모달은 초점을 안으로 옮기고, Tab을 안에 가두고, Escape로 닫히고,
// 닫힐 때 열었던 버튼으로 초점을 되돌려 준다. 배경은 aria/포인터에서 함께 비활성화한다.
export function useModalDialog(ref: RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const container = ref.current;
    if (!active || !container) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // 모달이 body 바로 아래가 아닐 수 있으므로, 조상 체인을 따라 올라가며
    // 각 단계의 형제들을 비활성화한다. body의 자식만 검사하면 조상이 모달을 품고 있어 아무것도 막지 못한다.
    const siblings: HTMLElement[] = [];
    for (let node: HTMLElement | null = container; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling !== node && sibling instanceof HTMLElement) siblings.push(sibling);
      }
    }
    const restoreInert = siblings.map((element) => {
      const hadInert = element.hasAttribute("inert");
      const previousHidden = element.getAttribute("aria-hidden");
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
      return () => {
        if (!hadInert) element.removeAttribute("inert");
        if (previousHidden === null) element.removeAttribute("aria-hidden"); else element.setAttribute("aria-hidden", previousHidden);
      };
    });

    const first = focusable(container)[0];
    (first ?? container).focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable(container);
      if (!items.length) { event.preventDefault(); container.focus({ preventScroll: true }); return; }
      const start = items[0]; const end = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === start || !container.contains(active))) { event.preventDefault(); end.focus(); }
      else if (!event.shiftKey && active === end) { event.preventDefault(); start.focus(); }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      for (const restore of restoreInert) restore();
      opener?.focus({ preventScroll: true });
    };
  }, [active, ref]);
}
