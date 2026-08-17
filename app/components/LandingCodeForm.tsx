"use client";

import { useRef, useState } from "react";

const CODE_LENGTH = 4;

export function LandingCodeForm() {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const complete = digits.every((digit) => digit !== "");

  function fillFrom(startIndex: number, value: string) {
    const chars = value.replace(/[^0-9]/g, "").slice(0, CODE_LENGTH - startIndex).split("");
    if (!chars.length) return;
    setDigits((current) => {
      const next = [...current];
      chars.forEach((char, offset) => { next[startIndex + offset] = char; });
      return next;
    });
    const focusIndex = Math.min(startIndex + chars.length, CODE_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();
  }

  function handleChange(index: number, rawValue: string) {
    const digitsOnly = rawValue.replace(/[^0-9]/g, "");
    if (!digitsOnly) {
      setDigits((current) => { const next = [...current]; next[index] = ""; return next; });
      return;
    }
    if (digitsOnly.length > 1) { fillFrom(index, digitsOnly); return; }
    setDigits((current) => { const next = [...current]; next[index] = digitsOnly; return next; });
    if (index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Backspace" || digits[index] || index === 0) return;
    setDigits((current) => { const next = [...current]; next[index - 1] = ""; return next; });
    inputRefs.current[index - 1]?.focus();
  }

  function handlePaste(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    if (!/[0-9]/.test(pasted)) return;
    event.preventDefault();
    fillFrom(index, pasted);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!complete) return;
    window.location.href = `/join?code=${digits.join("")}`;
  }

  return (
    <form className="landing-code-form" onSubmit={handleSubmit} aria-label="수업 코드로 입장">
      <div className="landing-code-boxes" role="group" aria-label="4자리 수업 코드">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            className="landing-code-box"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={1}
            value={digit}
            aria-label={`수업 코드 ${index + 1}번째 숫자`}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
          />
        ))}
      </div>
      <button type="submit" className="button primary large full landing-code-submit" disabled={!complete}>
        그리러 가기
      </button>
    </form>
  );
}
