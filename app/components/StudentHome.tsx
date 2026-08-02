"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { activeProfile, deactivateProfile, flushSaves, studentFetch } from "@/lib/client-session";
import { LESSONS, lessonBySlug } from "@/lib/lesson-content";
import { Logo } from "./Logo";
import { SpeakButton } from "./SpeakButton";

type HomeArtwork = { id: string; title: string; learningMode: string; lessonSlug: string | null; status: string; updatedAt: string };
type HomeData = { student: { id: string; nickname: string; animal: string; classroomName: string }; artworks: HomeArtwork[]; messages: Array<{ id: string; body: string; audience: string; createdAt: string }>; currentActivityKey: string; currentActivityLabel: string };

export function StudentHome() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const loadInFlight = useRef(false);
  const flushInFlight = useRef(false);

  const flushInBackground = useCallback(() => {
    const profile = activeProfile();
    if (!profile || flushInFlight.current) return;
    flushInFlight.current = true;
    void flushSaves(profile.studentId)
      .then((flushed) => {
        if (flushed.conflicts.length) setError("다른 기기의 저장과 겹친 그림이 있어요. 그림을 열어 새 사본으로 보관해 주세요.");
      })
      .catch(() => undefined)
      .finally(() => { flushInFlight.current = false; });
  }, []);

  const load = useCallback(async () => {
    if (loadInFlight.current || document.visibilityState === "hidden") return;
    const profile = activeProfile();
    if (!profile) { location.replace("/join"); return; }
    loadInFlight.current = true;
    flushInBackground();
    try {
      const response = await studentFetch("/api/student");
      const next = await response.json() as HomeData & { error?: string };
      if (!response.ok) throw new Error(next.error);
      setData(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "기록을 불러오지 못했어요.");
    } finally { loadInFlight.current = false; }
  }, [flushInBackground]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 12_000);
    const online = () => void load();
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); window.removeEventListener("online", online); document.removeEventListener("visibilitychange", visible); };
  }, [load]);

  const unfinished = useMemo(() => data?.artworks
    .filter((artwork) => artwork.status !== "complete")
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0], [data?.artworks]);

  if (!data) return <main className="app-shell"><header className="app-header"><Logo /></header><div className="loading-card" role="status">{error || "내 그림을 찾고 있어요…"}</div></main>;

  const newestMessage = data.messages.at(-1);
  const completed = new Set(data.artworks.filter((artwork) => artwork.status === "complete" && artwork.lessonSlug).map((artwork) => artwork.lessonSlug));
  const teacherLesson = data.currentActivityKey.startsWith("lesson:") ? lessonBySlug(data.currentActivityKey.slice(7)) : undefined;
  const teacherActivityPath = teacherLesson ? `/student/draw/new?lesson=${teacherLesson.slug}` : "/student/draw/new?mode=free";
  const teacherDone = teacherLesson ? completed.has(teacherLesson.slug) : data.artworks.some((artwork) => artwork.learningMode === "free" && artwork.status === "complete");
  const totalProgress = Math.round((completed.size / Math.max(1, LESSONS.length)) * 100);

  async function leaveClass() {
    if (leaving) return;
    setLeaving(true);
    await deactivateProfile().catch(() => undefined);
    location.replace("/join");
  }

  return <main className="app-shell student-app student-home-redesign">
    <header className="app-header student-home-header">
      <Logo />
      <div className="student-identity"><span aria-hidden="true">{data.student.animal}</span><div><b>{data.student.nickname}</b><small>{data.student.classroomName}</small></div></div>
      <div className="student-header-actions"><button className="small-button" onClick={() => void leaveClass()} disabled={leaving}>🐾 학생 바꾸기</button><button className="small-button finish-class-button" onClick={() => void leaveClass()} disabled={leaving}>🚪 수업 마치기</button></div>
    </header>
    {error && <p className="error-box" role="alert">{error}</p>}
    {newestMessage && <aside className="teacher-message"><span>👩‍🏫 선생님</span><p>{newestMessage.body}</p><SpeakButton text={`선생님이 말했어요. ${newestMessage.body}`} compact /><small>{newestMessage.audience === "all" ? "우리 반" : "나에게"}</small></aside>}

    <section className="student-home-hero">
      <span className="grimi-home-character" aria-hidden="true">✨</span>
      <div><p className="eyebrow">그리미와 함께</p><h1>오늘은 무엇을 그릴까?</h1><p>선생님이 고른 활동부터 시작해 봐요.</p></div>
      <SpeakButton text="오늘은 무엇을 그릴까? 선생님이 고른 활동부터 시작해 봐요." />
    </section>

    <nav className="student-primary-menu" aria-label="내 그림 메뉴">
      <a className="student-menu-card resume" href={unfinished ? `/student/draw/${unfinished.id}` : "/student/activities"}>
        <span aria-hidden="true">✏️</span><div><h2>이어 그리기</h2><p>{unfinished ? `${unfinished.title}을 이어서 그려요.` : "이어 그릴 그림이 없어요. 활동을 골라 시작해요."}</p></div><b>열기 →</b>
      </a>
      <a className="student-menu-card archive" href="/student/archive">
        <span aria-hidden="true">🖼️</span><div><h2>내 그림</h2><p>내가 그린 그림과 생각을 다시 봐요.</p></div><b>{data.artworks.length}개 →</b>
      </a>
      <a className="student-menu-card activities" href="/student/activities">
        <span aria-hidden="true">🎨</span><div><h2>활동 고르기</h2><p>선·도형부터 자유 창작까지 골라요.</p></div><b>고르기 →</b>
      </a>
    </nav>

    <section className="teacher-selected-activity">
      <div className="teacher-activity-icon" aria-hidden="true">{teacherLesson?.emoji ?? "✨"}</div>
      <div className="teacher-activity-copy"><p className="eyebrow">선생님이 선택한 오늘 활동</p><h2>{data.currentActivityLabel}</h2><p>{teacherLesson?.description ?? "빈 도화지에서 내 생각을 그리고, 필요할 때 그리미를 불러요."}</p><div className="teacher-activity-progress" aria-label={`전체 활동 ${totalProgress}% 진행`}><i style={{ width: `${totalProgress}%` }} /></div><small>{teacherDone ? "오늘 활동을 완성했어요" : "내 속도로 천천히 해도 좋아요"}</small></div>
      <a className="button primary child-primary-action" href={teacherActivityPath}><span aria-hidden="true">▶️</span>{teacherDone ? "한 번 더 그리기" : "활동 시작"}</a>
    </section>
  </main>;
}
