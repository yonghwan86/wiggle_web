"use client";

import { useEffect, useState } from "react";
import { studentFetch } from "@/lib/client-session";
import { lessonBySlug } from "@/lib/lesson-content";
import { Logo } from "./Logo";

type ArchiveArtwork = { id: string; title: string; learningMode: string; lessonSlug: string | null; status: string; updatedAt: string };

function modeLabel(artwork: ArchiveArtwork) {
  if (artwork.lessonSlug) return lessonBySlug(artwork.lessonSlug)?.title ?? "학습 그림";
  if (artwork.learningMode === "observe") return "관찰 그리기";
  if (artwork.learningMode === "guided") return "따라 그리기";
  if (artwork.learningMode === "practice") return "선·도형 기초";
  return "자유 창작";
}

export function Archive() {
  const [data, setData] = useState<{ student: { nickname: string; animal: string }; artworks: ArchiveArtwork[] } | null>(null);
  useEffect(() => { studentFetch("/api/student").then(async (response) => { const value = await response.json() as { student: { nickname: string; animal: string }; artworks: ArchiveArtwork[] }; if (response.ok) setData(value); else location.href = "/join"; }).catch(() => location.href = "/join"); }, []);
  return <main className="app-shell archive-page"><header className="app-header"><Logo /><a className="small-button" href="/student">← 오늘 그리기</a></header><section className="archive-hero"><div><p className="eyebrow">점수 대신 과정을 봐요</p><h1>{data ? `${data.student.animal} ${data.student.nickname}의` : "나의"}<br />성장 기록</h1></div><span className="growth-flower">🌱</span></section>{data && <div className="archive-grid">{data.artworks.map((artwork) => <a className="archive-card" href={`/student/draw/${artwork.id}`} key={artwork.id}><div className="archive-paper"><span>{artwork.status === "complete" ? "🌟" : "✏️"}</span></div><div><small>{modeLabel(artwork)}</small><h2>{artwork.title}</h2><p>{artwork.status === "complete" ? "내 생각을 말로 남겼어요." : "다음 선을 기다리고 있어요."}</p></div></a>)}</div>}</main>;
}
