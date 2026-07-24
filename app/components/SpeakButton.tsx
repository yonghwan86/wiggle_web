"use client";

import { useEffect, useRef, useState } from "react";

export function SpeakButton({ text, label = "들어 보기", compact = false }: { text: string; label?: string; compact?: boolean }) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    return () => {
      if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
      if (utteranceRef.current) window.speechSynthesis?.cancel();
    };
  }, []);

  function speak() {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) { setSupported(false); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/\s+/g, " ").trim());
    const koreanVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("ko"));
    if (koreanVoice) utterance.voice = koreanVoice;
    utterance.lang = "ko-KR";
    utterance.rate = 0.82;
    utterance.pitch = 1.05;
    const finish = () => {
      if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
      utteranceRef.current = null;
      setSpeaking(false);
    };
    setSpeaking(true);
    fallbackTimerRef.current = window.setTimeout(finish, Math.min(12_000, Math.max(2_500, text.length * 180)));
    utterance.onend = finish;
    utterance.onerror = finish;
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  return <button
    type="button"
    className={`speak-button${compact ? " compact" : ""}${speaking ? " speaking" : ""}`}
    aria-label={supported ? `${label}: ${text}` : `이 기기는 읽어주기를 지원하지 않아요. 선생님과 같이 읽어요: ${text}`}
    aria-pressed={speaking}
    disabled={!supported}
    onClick={speak}
  ><span aria-hidden="true">{!supported ? "👩‍🏫" : speaking ? "🔉" : "🔊"}</span>{!compact && <b>{!supported ? "같이 읽기" : speaking ? "듣는 중" : label}</b>}</button>;
}
