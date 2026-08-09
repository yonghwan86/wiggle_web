"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { studentFetch } from "@/lib/client-session";
import { Logo } from "./Logo";

type DetailArtwork = { id: string; title: string; topic: string; learningMode: string; lessonSlug: string | null; intent: string; status: string; updatedAt: string; completedAt: string | null };
type Reflection = { favoritePart?: string; favoriteReason?: string; spokenDescription?: string; storyText?: string; nextSuggestion?: string } | null;

export function ArtworkDetail() {
  const params = useParams<{ id: string }>();
  const [artwork, setArtwork] = useState<DetailArtwork | null>(null);
  const [reflection, setReflection] = useState<Reflection>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    void (async () => {
      try {
        const response = await studentFetch(`/api/artworks/${encodeURIComponent(params.id)}?summary=1`, { signal: controller.signal });
        const data = await response.json() as { artwork?: DetailArtwork; reflection?: Reflection; error?: string };
        if (!response.ok || !data.artwork) throw new Error(data.error ?? "그림을 찾지 못했어요.");
        if (data.artwork.status !== "complete") { location.replace(`/student/draw/${data.artwork.id}`); return; }
        setArtwork(data.artwork); setReflection(data.reflection ?? null);
        const imageResponse = await studentFetch(`/api/artworks/${encodeURIComponent(params.id)}/image?variant=final`, { signal: controller.signal });
        if (!imageResponse.ok) throw new Error("완성 그림을 불러오지 못했어요.");
        const blob = await imageResponse.blob();
        objectUrl = URL.createObjectURL(blob); setImageUrl(objectUrl);
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "그림을 불러오지 못했어요.");
      }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [params.id]);

  async function drawAgain() {
    if (!artwork || creating) return;
    setCreating(true); setError("");
    try {
      const response = await studentFetch("/api/artworks", { method: "POST", body: JSON.stringify({
        clientArtworkId: `artwork_${crypto.randomUUID().replaceAll("-", "")}`,
        learningMode: artwork.learningMode, lessonSlug: artwork.lessonSlug, title: artwork.title, topic: artwork.topic,
        intent: `${artwork.topic}을(를) 새로운 생각으로 다시 그려 보고 싶어요.`,
      }) });
      const data = await response.json() as { artwork?: { id: string }; error?: string };
      if (!response.ok || !data.artwork) throw new Error(data.error ?? "새 그림을 만들지 못했어요.");
      location.href = `/student/draw/${data.artwork.id}`;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "새 그림을 만들지 못했어요."); setCreating(false); }
  }

  return <main className="app-shell artwork-detail-page"><header className="app-header"><Logo /><a className="small-button" href="/student/archive">← 내 그림</a></header>
    {!artwork && !error && <div className="loading-card">완성한 그림을 펼치는 중…</div>}{error && <p className="error-box" role="alert">{error}</p>}
    {artwork && <article className="artwork-detail-card"><div className="artwork-detail-copy"><p className="eyebrow">🌟 완성한 작품</p><h1>{artwork.title}</h1><p>{artwork.intent}</p><p className="artwork-readonly-note">🔒 읽기 전용 · 완성한 그림은 그대로 안전하게 보관돼요.</p><time dateTime={artwork.completedAt ?? artwork.updatedAt}>{new Date(artwork.completedAt ?? artwork.updatedAt).toLocaleDateString("ko-KR")}</time></div>
      <div className="artwork-detail-image">{imageUrl ? <img src={imageUrl} alt={`${artwork.title} 완성 그림`} /> : <span>그림을 불러오는 중…</span>}</div>
      {reflection && <section className="artwork-reflection"><h2>내가 남긴 생각</h2>{reflection.favoritePart && <p><b>마음에 드는 곳</b><span>{reflection.favoritePart}</span></p>}{reflection.favoriteReason && <p><b>마음에 드는 이유</b><span>{reflection.favoriteReason}</span></p>}{reflection.storyText && <p><b>이야기</b><span>{reflection.storyText}</span></p>}{reflection.nextSuggestion && <p><b>다음에는</b><span>{reflection.nextSuggestion}</span></p>}</section>}
      <div className="artwork-detail-actions"><a className="button secondary" href="/student/archive">다른 그림 보기</a><button type="button" className="button primary" disabled={creating} onClick={drawAgain}>{creating ? "새 도화지 준비 중…" : "🎨 새 그림으로 다시 그리기"}</button></div></article>}
  </main>;
}
