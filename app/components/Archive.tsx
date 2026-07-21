"use client";
import { useEffect, useState } from "react";
import { studentFetch } from "@/lib/client-session";
import { Logo } from "./Logo";
export function Archive() {
  const [data, setData] = useState<{ student: { nickname: string; animal: string }; artworks: Array<{ id: string; title: string; learningMode: string; status: string; updatedAt: string }> } | null>(null);
  useEffect(() => { studentFetch("/api/student").then(async (response) => { const value = await response.json() as { student: { nickname: string; animal: string }; artworks: Array<{ id: string; title: string; learningMode: string; status: string; updatedAt: string }> }; if (response.ok) setData(value); else location.href = "/join"; }).catch(() => location.href = "/join"); }, []);
  return <main className="app-shell archive-page"><header className="app-header"><Logo /><a className="small-button" href="/student">← 오늘 그리기</a></header><section className="archive-hero"><div><p className="eyebrow">점수 대신 과정을 봐요</p><h1>{data ? `${data.student.animal} ${data.student.nickname}의` : "나의"}<br />성장 기록</h1></div><span className="growth-flower">🌱</span></section>{data && <div className="archive-grid">{data.artworks.map((artwork) => <a className="archive-card" href={`/student/draw/${artwork.id}`} key={artwork.id}><div className="archive-paper"><span>{artwork.status === "complete" ? "🌟" : "✏️"}</span></div><div><small>{artwork.learningMode === "free" ? "자유 창작" : artwork.learningMode === "guided" ? "보고 그리기" : "기초 연습"}</small><h2>{artwork.title}</h2><p>{artwork.status === "complete" ? "내 생각을 말로 남겼어요." : "다음 선을 기다리고 있어요."}</p></div></a>)}</div>}</main>;
}
