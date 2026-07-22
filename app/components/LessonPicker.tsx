"use client";

import { CURRICULUM_STAGES, LESSONS, LessonMode } from "@/lib/lesson-content";
import { Logo } from "./Logo";

export function LessonPicker({ mode }: { mode: LessonMode }) {
  const stage = CURRICULUM_STAGES.find((item) => item.mode === mode);
  const lessons = LESSONS.filter((lesson) => lesson.mode === mode);
  return <main className="app-shell lesson-page">
    <header className="app-header"><Logo /><a className="small-button" href="/student">← 돌아가기</a></header>
    <section className="lesson-hero">
      <p className="eyebrow">{stage?.stage}단계 · 순서대로 해도, 골라서 해도 좋아요</p>
      <h1>{stage?.title}</h1>
      <p>{stage?.description} 모든 활동은 바로 시작할 수 있고, 마지막에는 꼭 내 생각을 더해요.</p>
    </section>
    <div className="lesson-list">{lessons.map((lesson, index) => {
      const choices = lesson.steps.filter((step) => step.choices?.length).length;
      return <a className="lesson-card" href={`/student/draw/new?lesson=${lesson.slug}`} key={lesson.slug}>
        <span>{lesson.emoji}</span><div><small>{index + 1}/10</small><h2>{lesson.title}</h2><p>{lesson.description}</p><small>{lesson.steps.length}단계 · 내가 고르는 순간 {choices}번</small></div><b>시작 →</b>
      </a>;
    })}</div>
    <a className="button secondary" href="/student/draw/new?mode=free">바로 자유롭게 그리기</a>
  </main>;
}
