"use client";

import { useCallback, useEffect, useState } from "react";
import { activeProfile, deactivateProfile, flushSaves, studentFetch } from "@/lib/client-session";
import { CURRICULUM_STAGES, LESSONS, lessonBySlug } from "@/lib/lesson-content";
import { Logo } from "./Logo";

type HomeArtwork = { id: string; title: string; learningMode: string; lessonSlug: string | null; status: string; updatedAt: string };
type HomeData = { student: { id: string; nickname: string; animal: string; classroomName: string }; artworks: HomeArtwork[]; messages: Array<{ id: string; body: string; audience: string; createdAt: string }>; currentActivityKey: string; currentActivityLabel: string };

function artworkActivityLabel(artwork: HomeArtwork) {
  const lesson = artwork.lessonSlug ? lessonBySlug(artwork.lessonSlug) : undefined;
  if (lesson) return lesson.title;
  if (artwork.learningMode === "practice") return "선·도형 기초";
  if (artwork.learningMode === "guided") return "따라 그리기";
  if (artwork.learningMode === "observe") return "관찰 그리기";
  return "자유 창작";
}

export function StudentHome() {
  const [data, setData] = useState<HomeData | null>(null); const [error, setError] = useState("");
  const load = useCallback(async () => {
    const profile = activeProfile(); if (!profile) { location.href = "/join"; return; }
    try {
      const flushed = await flushSaves(profile.studentId);
      if (flushed.conflicts.length) setError("다른 기기 저장과 겹친 그림이 있어요. 그림에서 새 사본으로 보관해 주세요.");
      const response = await studentFetch("/api/student"); const next = await response.json() as HomeData & { error?: string };
      if (!response.ok) throw new Error(next.error); setData(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "기록을 불러오지 못했어요."); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(load, 8000); const online = () => void load(); window.addEventListener("online", online); return () => { clearInterval(timer); window.removeEventListener("online", online); }; }, [load]);
  if (!data) return <main className="app-shell"><header className="app-header"><Logo /></header><div className="loading-card">{error || "내 그림을 찾는 중…"}</div></main>;

  const newestMessage = data.messages.at(-1);
  const completed = new Set(data.artworks.filter((artwork) => artwork.status === "complete" && artwork.lessonSlug).map((artwork) => artwork.lessonSlug));
  const recommended = LESSONS.find((lesson) => !completed.has(lesson.slug)) ?? LESSONS[0];
  const progress = Math.round((completed.size / LESSONS.length) * 100);
  const teacherLesson = data.currentActivityKey.startsWith("lesson:") ? lessonBySlug(data.currentActivityKey.slice(7)) : undefined;
  const teacherActivityPath = teacherLesson ? `/student/draw/new?lesson=${teacherLesson.slug}` : "/student/draw/new?mode=free";

  return <main className="app-shell student-app">
    <header className="app-header"><Logo /><div className="student-identity"><span>{data.student.animal}</span><div><b>{data.student.nickname}</b><small>{data.student.classroomName}</small></div></div><button className="small-button" onClick={async () => { await deactivateProfile(); location.href = "/join"; }}>학생 바꾸기</button></header>
    {error && <p className="error-box" role="alert">{error}</p>}
    {newestMessage && <aside className="teacher-message"><span>선생님</span><p>{newestMessage.body}</p><small>{newestMessage.audience === "all" ? "우리 반에게" : "나에게"}</small></aside>}
    <section className="welcome curriculum-welcome"><div><p className="eyebrow">오늘 선생님 추천</p><h1>{teacherLesson?.emoji ?? "✨"} {data.currentActivityLabel}</h1><p>{teacherLesson?.description ?? "빈 도화지에서 시작하고, 필요할 때만 그리미를 불러요."}</p><a className="button primary" href={teacherActivityPath}>오늘 활동 시작</a></div><div className="curriculum-total"><strong>{completed.size}/30</strong><span>활동 완성</span><div aria-label={`전체 진행률 ${progress}%`}><i style={{ width: `${progress}%` }} /></div><small>내 다음 추천</small><a href={`/student/draw/new?lesson=${recommended.slug}`}>{recommended.emoji} {recommended.title} →</a></div></section>
    <section><div className="section-title"><div><h2>내 그림 여행 4단계</h2><p>순서는 추천이에요. 원하는 단계부터 시작해도 좋아요.</p></div><a href="/student/archive">성장 기록 →</a></div><div className="curriculum-grid">{CURRICULUM_STAGES.map((stage) => {
      const stageLessons = LESSONS.filter((lesson) => lesson.stage === stage.stage);
      const done = stage.stage === 4 ? data.artworks.filter((artwork) => artwork.learningMode === "free" && artwork.status === "complete").length : stageLessons.filter((lesson) => completed.has(lesson.slug)).length;
      return <a className={`curriculum-card stage-${stage.stage}`} href={stage.path} key={stage.stage}><span>{stage.emoji}</span><div><small>{stage.stage}단계 · 잠금 없음</small><h3>{stage.title}</h3><p>{stage.description}</p><div className="stage-progress"><i style={{ width: `${stage.stage === 4 ? Math.min(100, done * 20) : done * 10}%` }} /></div><b>{stage.stage === 4 ? `${done}개 자유 작품` : `${done}/10 완성`}</b></div><strong>열기 →</strong></a>;
    })}</div><a className="button secondary always-free" href="/student/draw/new?mode=free">✨ 바로 자유롭게 그리기</a></section>
    <section className="recent-section"><div className="section-title"><h2>이어 그릴 그림</h2><span>{data.artworks.length}개의 기록</span></div>{data.artworks.length ? <div className="recent-row">{data.artworks.slice(0, 4).map((artwork) => <a className="recent-art" href={`/student/draw/${artwork.id}`} key={artwork.id}><div className="mini-paper"><span>{artwork.status === "complete" ? "🌟" : "✏️"}</span></div><b>{artwork.title}</b><small>{artworkActivityLabel(artwork)} · {artwork.status === "complete" ? "완성했어요" : "이어 그리기"}</small></a>)}</div> : <div className="empty-state">첫 그림이 기다리고 있어요.</div>}</section>
    <footer className="student-footer"><a href="/student">오늘 그리기</a><a href="/student/archive">성장 기록</a><button onClick={async () => { await deactivateProfile(); location.href = "/join"; }}>수업 마치기</button></footer>
  </main>;
}
