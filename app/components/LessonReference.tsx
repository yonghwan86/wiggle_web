"use client";

import { useState } from "react";
import type { Lesson } from "@/lib/lesson-content";
import { LessonFinishedIllustration } from "./LessonFinishedIllustration";
import { LessonIllustration } from "./LessonIllustration";

export function LessonReference({ lesson, currentStep, className = "" }: { lesson: Lesson; currentStep?: number; className?: string }) {
  const [open, setOpen] = useState(false);

  if (lesson.mode === "guided") {
    return <LessonFinishedIllustration lesson={lesson} className={className} />;
  }

  if (lesson.mode !== "observe" || !lesson.referenceImage) {
    return <LessonIllustration lesson={lesson} currentStep={currentStep} className={className} />;
  }

  const words = lesson.observationWords ?? [];
  return <div className={`observation-reference ${className}`.trim()}>
    <button className="observation-reference-preview" type="button" onClick={() => setOpen(true)} aria-label={`${lesson.topic} 관찰 그림 크게 보기`}>
      <img src={lesson.referenceImage} alt={`${lesson.topic}의 모양과 특징을 살펴보는 관찰 그림`} loading={currentStep === undefined ? "lazy" : "eager"} decoding="async" />
      <span>🔎 크게 보기</span>
    </button>
    {words.length > 0 && <div className="observation-word-list" aria-label="그림에서 찾아볼 특징">
      {words.map((word) => <span key={word}>{word}</span>)}
    </div>}
    {open && <div className="observation-reference-backdrop" role="dialog" aria-modal="true" aria-label={`${lesson.topic} 관찰 그림`} onClick={() => setOpen(false)}>
      <section className="observation-reference-dialog" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={() => setOpen(false)} aria-label="관찰 그림 닫기">×</button>
        <p className="eyebrow">3단계 · 눈으로 관찰해요</p>
        <h2>{lesson.title}</h2>
        <img src={lesson.referenceImage} alt={`${lesson.topic}의 전체 모습을 보여주는 관찰 그림`} />
        <div className="observation-dialog-words"><b>무엇이 보이나요?</b>{words.map((word) => <span key={word}>{word}</span>)}</div>
      </section>
    </div>}
  </div>;
}
