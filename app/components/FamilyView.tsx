"use client";

import { useEffect, useMemo, useState } from "react";
import type { DrawDocument, DrawOp } from "@/lib/drawing-model";
import { Logo } from "./Logo";
import { TimelapsePlayer } from "./TimelapsePlayer";

type PublicOp = Omit<DrawOp, "opId" | "clientOpId" | "at">;
type FamilyPayload = {
  family: { animal: string; scope: "artwork" | "bundle"; expiresAt: string };
  artworks: Array<{ position: number; anchor: string; imageDataUrl: string; timelapseOps: PublicOp[] }>;
  report: {
    period: { start: string; end: string };
    summary: string;
    observations: Array<{ artworkAnchor: string; text: string }>;
    childWords: Array<{ artworkAnchor: string; text: string }>;
    verificationLinks: Array<{ artworkAnchor: string; label: string }>;
    note: string;
  };
  error?: string;
};

function timelapseDocument(ops: PublicOp[]): DrawDocument {
  return {
    schemaVersion: 1,
    rendererVersion: 1,
    size: 1024,
    ops: ops.map((operation, index) => ({
      ...operation,
      opId: `family_${String(index).padStart(8, "0")}`,
      clientOpId: `family_client_${String(index).padStart(8, "0")}`,
      at: new Date(index).toISOString(),
    })) as DrawOp[],
  };
}

function roundedDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date(value));
}

async function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source;
  });
}

export function FamilyView() {
  const [data, setData] = useState<FamilyPayload | null>(null); const [error, setError] = useState("");
  const [timelapse, setTimelapse] = useState<number | null>(null); const [copyState, setCopyState] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/family/session", { cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal })
      .then(async (response) => { const payload = await response.json() as FamilyPayload; if (!response.ok) throw new Error(payload.error ?? "공유 기록을 열 수 없어요."); setData(payload); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "공유 기록을 열 수 없어요."); });
    return () => controller.abort();
  }, []);
  const reportObservation = data?.report.observations[0]?.text ?? "작품에서 관찰한 과정을 함께 확인해 주세요.";
  const canUseWebShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const currentDocument = useMemo(() => timelapse === null || !data ? null : timelapseDocument(data.artworks[timelapse].timelapseOps), [data, timelapse]);

  async function cardBlob(format: "square" | "story") {
    if (!data?.artworks[0]) throw new Error("카드에 넣을 작품이 없어요.");
    const width = 1080; const height = format === "square" ? 1080 : 1920;
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("카드를 만들 수 없어요.");
    context.fillStyle = "#EAF8FC"; context.fillRect(0, 0, width, height);
    context.fillStyle = "#FFFFFF"; context.beginPath(); context.roundRect(70, 70, width - 140, height - 140, 54); context.fill();
    context.fillStyle = "#1B3A57"; context.font = "800 54px sans-serif"; context.fillText("Wiggle 이번 주 그림 기록", 120, 155);
    context.font = "700 37px sans-serif"; context.fillStyle = "#42718A"; context.fillText(`${data.family.animal} 작품과 아이의 말`, 120, 215);
    const image = await loadImage(data.artworks[0].imageDataUrl); const top = 275; const imageSize = Math.min(840, height - 620);
    context.drawImage(image, 120, top, 840, imageSize);
    context.fillStyle = "#1B3A57"; context.font = "700 32px sans-serif";
    const text = reportObservation.length > 42 ? `${reportObservation.slice(0, 42)}…` : reportObservation;
    context.fillText(text, 120, top + imageSize + 70);
    context.fillStyle = "#5C7C8E"; context.font = "500 25px sans-serif"; context.fillText("승인된 비공개 기록 · 이름과 학교 정보는 카드에 넣지 않아요", 120, height - 115);
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("카드를 만들 수 없어요.")), "image/png"));
  }

  async function downloadCard(format: "square" | "story") {
    try {
      const blob = await cardBlob(format); const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `wiggle-family-${format}.png`; link.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "카드를 저장하지 못했어요."); }
  }

  async function issueHandoff() {
    const response = await fetch("/api/family/invite", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const payload = await response.json() as { url?: string; error?: string };
    if (!response.ok || !payload.url) throw new Error(payload.error ?? "새 가족 입장 링크를 만들지 못했어요.");
    return payload.url;
  }

  async function systemShare() {
    if (!canUseWebShare) return;
    try {
      const handoffUrl = await issueHandoff();
      const blob = await cardBlob("square"); const file = new File([blob], "wiggle-family-square.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ title: "Wiggle 가족 성장 기록", text: "10분 안에 한 번 열 수 있는 비공개 입장 링크예요.", url: handoffUrl, files: [file] });
      else await navigator.share({ title: "Wiggle 가족 성장 기록", text: "10분 안에 한 번 열 수 있는 비공개 입장 링크예요.", url: handoffUrl });
    } catch (cause) { if ((cause as DOMException)?.name !== "AbortError") setError("시스템 공유를 열지 못했어요. 이미지 저장이나 링크 복사를 이용해 주세요."); }
  }

  async function copyLink() {
    try { const handoffUrl = await issueHandoff(); await navigator.clipboard.writeText(handoffUrl); setCopyState("10분 안에 한 번 열 수 있는 새 링크를 복사했어요."); }
    catch { setCopyState("새 링크를 만들거나 복사하지 못했어요. 잠시 뒤 다시 시도해 주세요."); }
  }

  if (error && !data) return <main className="family-shell"><section className="family-unavailable"><Logo /><h1>공유 기록을 열 수 없어요</h1><p>{error}</p><small>보호자나 교사에게 새 링크를 요청해 주세요.</small></section></main>;
  if (!data) return <main className="family-shell"><div className="loading-card">비공개 성장 기록을 여는 중…</div></main>;
  return <main className="family-shell"><header className="family-header"><Logo /><div><b>가족용 비공개 기록</b><small>{roundedDate(data.report.period.start)}–{roundedDate(data.report.period.end)}</small></div><button className="small-button no-print" onClick={() => window.print()}>작품집 인쇄</button></header>
    <section className="family-hero"><div><p className="eyebrow">작품과 아이의 말을 함께 봐요</p><h1>{data.family.animal} 이번 주에<br />그림으로 남긴 생각</h1><p>{data.report.summary}</p></div><div className="family-expiry"><span>🔒</span><b>제한된 링크</b><small>{roundedDate(data.family.expiresAt)}까지 열 수 있어요.</small></div></section>
    <section className="family-report"><div className="section-title"><div><p className="eyebrow">주간 성장 편지</p><h2>과정에서 관찰한 변화</h2></div></div><div className="family-observations">{data.report.observations.map((item, index) => <a href={item.artworkAnchor} key={`${item.artworkAnchor}-${index}`}><span>🌱</span><p>{item.text}</p></a>)}</div>{data.report.childWords.length > 0 && <div className="child-words"><h3>아이가 남긴 말</h3>{data.report.childWords.map((item, index) => <blockquote key={`${item.artworkAnchor}-${index}`}>“{item.text}” <a href={item.artworkAnchor}>작품 보기</a></blockquote>)}</div>}<p className="report-note">{data.report.note}</p></section>
    <section className="family-artworks"><div className="section-title"><div><p className="eyebrow">승인된 작품만</p><h2>이번 작품집</h2></div><span>{data.artworks.length}개</span></div>{data.artworks.map((artwork, index) => <article className="family-artwork" id={artwork.anchor} key={artwork.anchor}><div className="family-artwork-image"><img src={artwork.imageDataUrl} alt={`공유 작품 ${artwork.position}`} /></div><div><p className="eyebrow">작품 {artwork.position}</p><h3>그림이 자란 과정도 함께 봐요</h3><p>원본 선을 바꾸지 않은 그리기 동작을 순서대로 재생할 수 있어요.</p><button className="button secondary no-print" onClick={() => setTimelapse(index)}>타임랩스 보기</button></div></article>)}</section>
    <section className="family-share-tools no-print"><div><p className="eyebrow">개인정보를 덜어낸 카드</p><h2>가족에게 안전하게 전하기</h2><p>카드에는 학생 이름, 학교·학급 이름, 교사 정보와 내부 번호를 넣지 않아요. 공유할 때마다 10분 안에 한 번만 열 수 있는 새 입장 링크를 만듭니다.</p></div><div className="family-share-actions">{canUseWebShare && <button className="button primary" onClick={systemShare}>시스템 공유</button>}<button className="button secondary" onClick={() => downloadCard("square")}>정사각 카드 저장</button><button className="button secondary" onClick={() => downloadCard("story")}>세로 카드 저장</button><button className="button ghost" onClick={copyLink}>1회용 입장 링크 복사</button></div>{copyState && <small role="status">{copyState}</small>}</section>
    <footer className="family-footer">이 화면은 교사가 승인한 작품만 보여 줍니다. 링크가 불필요해지면 교사가 바로 취소할 수 있어요.</footer>
    {currentDocument && <TimelapsePlayer document={currentDocument} onClose={() => setTimelapse(null)} />}</main>;
}
