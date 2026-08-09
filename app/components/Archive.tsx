"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { studentFetch } from "@/lib/client-session";
import { lessonBySlug } from "@/lib/lesson-content";
import { Logo } from "./Logo";

type ArchiveArtwork = { id: string; title: string; learningMode: string; lessonSlug: string | null; status: string; hasImage: number | boolean; updatedAt: string; completedAt: string | null };

function ArtworkPreview({ artwork }: { artwork: ArchiveArtwork }) {
  const [imageUrl, setImageUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!artwork.hasImage) return;
    const controller = new AbortController();
    let objectUrl = "";
    studentFetch(`/api/artworks/${encodeURIComponent(artwork.id)}/image`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("preview unavailable");
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error("invalid preview");
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artwork.hasImage, artwork.id]);

  if (imageUrl) return <img src={imageUrl} alt={`${artwork.title} 그림 미리보기`} />;
  return <span aria-label={failed ? "그림 미리보기를 불러오지 못했어요" : "그림 미리보기를 불러오는 중"}>{artwork.status === "complete" ? "🌟" : "✏️"}</span>;
}

function modeLabel(artwork: ArchiveArtwork) {
  const lesson = artwork.lessonSlug ? lessonBySlug(artwork.lessonSlug) : undefined;
  if (lesson) return lesson.title;
  if (artwork.learningMode === "practice") return "선·도형 기초";
  if (artwork.learningMode === "guided") return "따라 그리기";
  if (artwork.learningMode === "observe") return "관찰 그리기";
  return "자유 창작";
}

export function Archive() {
  const [data, setData] = useState<{ student: { nickname: string; animal: string }; artworks: ArchiveArtwork[] } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const loadingRef = useRef(false);

  const loadArchive = useCallback(async (offset = 0, append = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true); setError("");
    try {
      const response = await studentFetch(`/api/student?artworkOffset=${offset}`);
      const value = await response.json() as { student: { nickname: string; animal: string }; artworks: ArchiveArtwork[]; artworkHasMore?: boolean; artworkNextOffset?: number; error?: string };
      if (!response.ok) {
        if (response.status === 401) location.replace("/join");
        else throw new Error(value.error ?? "그림을 불러오지 못했어요.");
        return;
      }
      setData((current) => {
        if (!append || !current) return { student: value.student, artworks: value.artworks };
        const known = new Set(current.artworks.map((item) => item.id));
        return { student: value.student, artworks: [...current.artworks, ...value.artworks.filter((item) => !known.has(item.id))] };
      });
      setHasMore(Boolean(value.artworkHasMore));
      setNextOffset(value.artworkNextOffset ?? offset + value.artworks.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "그림을 불러오지 못했어요.");
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { void loadArchive(); }, [loadArchive]);
  return <main className="app-shell archive-page"><header className="app-header"><Logo /><a className="small-button" href="/student">← 처음 화면</a></header><section className="archive-hero"><div><p className="eyebrow">내가 그린 생각을 다시 봐요</p><h1>{data ? `${data.student.animal} ${data.student.nickname}의` : "나의"}<br />내 그림</h1></div><span className="growth-flower">🖼️</span></section>{error && <p className="error-box" role="alert">{error}</p>}{data && (data.artworks.length ? <><div className="archive-grid">{data.artworks.map((artwork) => <a className="archive-card" href={artwork.status === "complete" ? `/student/archive/${artwork.id}` : `/student/draw/${artwork.id}`} key={artwork.id}><div className="archive-paper"><ArtworkPreview artwork={artwork} /></div><div><small>{modeLabel(artwork)}</small><h2>{artwork.title}</h2><p>{artwork.status === "complete" ? "👀 완성한 그림 다시 보기" : "✏️ 이어 그리기"}</p><time dateTime={artwork.completedAt ?? artwork.updatedAt}>{new Date(artwork.completedAt ?? artwork.updatedAt).toLocaleDateString("ko-KR")}</time></div></a>)}</div>{hasMore && <button type="button" className="button secondary archive-more-button" disabled={loadingMore} onClick={() => void loadArchive(nextOffset, true)}>{loadingMore ? "이전 그림 불러오는 중…" : "이전 그림 더 보기"}</button>}</> : <div className="empty-state">아직 그림이 없어요. 활동을 골라 첫 그림을 시작해 봐요.<br /><a className="button secondary" href="/student/activities">🎨 활동 고르기</a></div>)}</main>;
}
