"use client";

import { useEffect, useRef, useState } from "react";
import { browserSpeechEnvironment, createSpeechSpeaker, SpeechSpeaker, SpeechStatus } from "@/lib/speech";

export function SpeakButton({ text, label = "들어 보기", compact = false }: { text: string; label?: string; compact?: boolean }) {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [supported, setSupported] = useState(true);
  const speakerRef = useRef<SpeechSpeaker | null>(null);

  useEffect(() => {
    const env = browserSpeechEnvironment();
    setSupported(Boolean(env));
    if (!env) return;
    const speaker = createSpeechSpeaker(env, setStatus);
    speakerRef.current = speaker;
    return () => {
      speakerRef.current = null;
      speaker.dispose();
    };
  }, []);

  function handleClick() {
    const speaker = speakerRef.current;
    if (!speaker) return;
    if (status === "speaking") { speaker.stop(); return; }
    speaker.speak(text);
  }

  const fallback = !supported || status === "failed";
  const ariaLabel = !supported
    ? `이 기기는 읽어주기를 지원하지 않아요. 선생님과 같이 읽어요: ${text}`
    : status === "failed"
      ? `소리가 나오지 않았어요. 선생님과 같이 읽어요. 눌러서 다시 들어 보기: ${text}`
      : status === "speaking"
        ? `듣는 중이에요. 누르면 멈춰요: ${text}`
        : `${label}: ${text}`;
  const icon = fallback ? "👩‍🏫" : status === "speaking" ? "🔉" : "🔊";
  const caption = fallback ? "같이 읽기" : status === "speaking" ? "듣는 중" : label;
  return <button
    type="button"
    className={`speak-button${compact ? " compact" : ""}${status === "speaking" ? " speaking" : ""}${fallback ? " fallback" : ""}`}
    aria-label={ariaLabel}
    aria-pressed={status === "speaking"}
    onClick={handleClick}
  ><span aria-hidden="true">{icon}</span>{!compact && <b>{caption}</b>}{fallback && <i className="speak-fallback-mark" aria-hidden="true">⚠️</i>}</button>;
}
