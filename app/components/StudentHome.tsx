"use client";

import { useCallback, useEffect, useState } from "react";
import { activeProfile, deactivateProfile, flushSaves, studentFetch } from "@/lib/client-session";
import { Logo } from "./Logo";

type HomeData = { student: { id: string; nickname: string; animal: string; classroomName: string }; artworks: Array<{ id: string; title: string; learningMode: string; status: string; updatedAt: string }>; messages: Array<{ id: string; body: string; audience: string; createdAt: string }> };

export function StudentHome() {
  const [data, setData] = useState<HomeData | null>(null); const [error, setError] = useState("");
  const load = useCallback(async () => {
    const profile = activeProfile(); if (!profile) { location.href = "/join"; return; }
    try { const flushed = await flushSaves(profile.studentId); if (flushed.conflicts.length) setError("다른 기기 저장과 겹친 그림이 있어요. 그림에서 새 사본으로 보관해 주세요."); const response = await studentFetch("/api/student"); const next = await response.json() as HomeData & { error?: string }; if (!response.ok) throw new Error(next.error); setData(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "기록을 불러오지 못했어요."); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(load, 8000); const online = () => void load(); window.addEventListener("online", online); return () => { clearInterval(timer); window.removeEventListener("online", online); }; }, [load]);
  if (!data) return <main className="app-shell"><header className="app-header"><Logo /></header><div className="loading-card">{error || "내 그림을 펼치는 중…"}</div></main>;
  const newestMessage = data.messages.at(-1);
  return <main className="app-shell student-app"><header className="app-header"><Logo /><div className="student-identity"><span>{data.student.animal}</span><div><b>{data.student.nickname}</b><small>{data.student.classroomName}</small></div></div><button className="small-button" onClick={async () => { await deactivateProfile(); location.href = "/join"; }}>학생 바꾸기</button></header>
    {error && <p className="error-box" role="alert">{error}</p>}
    {newestMessage && <aside className="teacher-message"><span>선생님</span><p>{newestMessage.body}</p><small>{newestMessage.audience === "all" ? "우리 반에게" : "나에게"}</small></aside>}
    <section className="welcome"><div><p className="eyebrow">오늘도 반가워!</p><h1>{data.student.nickname},<br />무엇을 그려볼까?</h1></div><div className="welcome-doodle" aria-hidden="true"><span>✏️</span><i /></div></section>
    <section><div className="section-title"><h2>바로 시작해요</h2><a href="/student/archive">내 성장 기록 →</a></div><div className="activity-grid"><a className="activity-card blue" href="/student/practice"><span>〰️</span><div><small>기초 연습</small><h3>선과 도형 놀이터</h3><p>손을 풀고 모양을 만나요.</p></div></a><a className="activity-card yellow" href="/student/guided"><span>🐶</span><div><small>보고 그리기</small><h3>한 단계씩 따라가기</h3><p>보고, 고르고, 내 생각을 더해요.</p></div></a><a className="activity-card green" href="/student/draw/new?mode=free"><span>🎨</span><div><small>자유 창작</small><h3>내 마음대로 그리기</h3><p>빈 도화지에서 시작해요.</p></div></a></div></section>
    <section className="recent-section"><div className="section-title"><h2>이어 그릴 그림</h2><span>{data.artworks.length}개의 기록</span></div>{data.artworks.length ? <div className="recent-row">{data.artworks.slice(0, 4).map((artwork) => <a className="recent-art" href={`/student/draw/${artwork.id}`} key={artwork.id}><div className="mini-paper"><span>{artwork.status === "complete" ? "✓" : "✎"}</span></div><b>{artwork.title}</b><small>{artwork.status === "complete" ? "완성했어요" : "이어 그리기"}</small></a>)}</div> : <div className="empty-state">첫 그림이 기다리고 있어요!</div>}</section>
    <footer className="student-footer"><a href="/student">오늘 그리기</a><a href="/student/archive">성장 기록</a><button onClick={async () => { await deactivateProfile(); location.href = "/join"; }}>수업 마치기</button></footer></main>;
}
