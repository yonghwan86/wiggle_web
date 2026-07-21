"use client";
import { LESSONS } from "@/lib/lesson-content";
import { Logo } from "./Logo";
export function LessonPicker({ mode }: { mode: "practice" | "guided" }) {
  const lessons = LESSONS.filter((lesson) => lesson.mode === mode);
  return <main className="app-shell lesson-page"><header className="app-header"><Logo /><a className="small-button" href="/student">← 돌아가기</a></header><section className="lesson-hero"><p className="eyebrow">{mode === "practice" ? "손을 가볍게 풀어요" : "한 번에 한 단계씩"}</p><h1>{mode === "practice" ? "어떤 모양으로 놀까?" : "무엇을 보고 그릴까?"}</h1><p>{mode === "practice" ? "다 해도 좋고, 바로 자유롭게 그려도 좋아요." : "마지막에는 꼭 내 생각을 더해요."}</p></section><div className="lesson-list">{lessons.map((lesson) => <a className="lesson-card" href={`/student/draw/new?lesson=${lesson.slug}`} key={lesson.slug}><span>{lesson.emoji}</span><div><h2>{lesson.title}</h2><p>{lesson.description}</p><small>{lesson.steps.length}단계 · 선택 {lesson.openSteps.length}번</small></div><b>시작 →</b></a>)}</div><a className="button secondary" href="/student/draw/new?mode=free">그냥 내 마음대로 그릴래</a></main>;
}
